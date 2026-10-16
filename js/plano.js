/*
 * Plano de corte do Otimizador de Cortes em PDF, para anexar ao orçamento.
 *
 * Usa o próprio código publicado do Otimizador (js/optimizer.js e js/render.js),
 * carregado só quando precisa: o plano calculado e o desenho das chapas saem
 * iguais aos do Otimizador.
 *
 * Os projetos vêm de três lugares:
 *   - nuvem: tabela "projects" do Supabase (mesma conta do Otimizador);
 *   - aparelho: projetos salvos no navegador pelo Otimizador (mesmo endereço do site);
 *   - arquivo .json exportado pelo Otimizador.
 */
(function (global) {
  'use strict';

  const BASE = ((global.APP_CONFIG || {}).otimizadorUrl || 'https://gabrielfbrandao9.github.io/otimizador-de-cortes/').replace(/\/?$/, '/');

  const WOOD = [123, 74, 38];
  const WOOD_SOFT = [244, 234, 220];
  const INK = [35, 28, 21];
  const MUTED = [117, 104, 90];
  const LINE = [222, 212, 198];

  // ---------- Código do Otimizador ----------

  let libs = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('não foi possível carregar o Otimizador de Cortes. Verifique a internet.'));
      document.head.appendChild(s);
    });
  }
  function loadLibs() {
    if (global.Optimizer && global.Render) return Promise.resolve();
    if (!libs) {
      libs = Promise.all([loadScript(BASE + 'js/optimizer.js'), loadScript(BASE + 'js/render.js')])
        .catch((err) => { libs = null; throw err; });
    }
    return libs;
  }

  // ---------- Projetos ----------

  function readLocal(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  const isProject = (d) => !!d && Array.isArray(d.pieces) && Array.isArray(d.stocks);

  // [{ fonte: 'nuvem' | 'aparelho' | 'atual', id, nome, quando }]
  async function listProjects(conectado) {
    const out = [];
    if (conectado && global.Cloud && Cloud.enabled) {
      try {
        (await Cloud.listCutProjects()).forEach((p) => out.push({ fonte: 'nuvem', id: p.id, nome: p.name, quando: Date.parse(p.updated_at) || 0 }));
      } catch (e) {
        console.error(e);
      }
    }
    const salvos = readLocal('otimizador:projetos', {});
    Object.keys(salvos).forEach((nome) => {
      if (isProject(salvos[nome] && salvos[nome].state)) out.push({ fonte: 'aparelho', id: nome, nome, quando: salvos[nome].savedAt || 0 });
    });
    const atual = readLocal('otimizador:atual', null);
    if (isProject(atual) && atual.pieces.some((p) => +p.length > 0 && +p.width > 0)) {
      out.push({ fonte: 'atual', id: 'atual', nome: atual.name || 'Projeto sem nome', quando: Infinity });
    }
    return out.sort((a, b) => b.quando - a.quando);
  }

  async function loadProject(item) {
    let data = null;
    if (item.fonte === 'nuvem') data = (await Cloud.loadCutProject(item.id)).data;
    else if (item.fonte === 'aparelho') data = (readLocal('otimizador:projetos', {})[item.id] || {}).state;
    else if (item.fonte === 'atual') data = readLocal('otimizador:atual', null);
    if (!isProject(data)) throw new Error('o projeto está vazio ou não é do Otimizador de Cortes');
    return { ...data, name: data.name || item.nome };
  }

  async function projectFromFile(file) {
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch (e) {
      throw new Error('o arquivo não é um projeto do Otimizador (.json)');
    }
    if (!isProject(data)) throw new Error('o arquivo não é um projeto do Otimizador (.json)');
    return { ...data, name: data.name || file.name.replace(/\.json$/i, '') };
  }

  // ---------- PDF ----------

  const nf = (n, d = 0) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const clean = (s) => String(s || '')
    .replace(/[−–—]/g, '-')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

  // Desenho de uma chapa como JPEG (o PDF fica bem menor que com PNG).
  function sheetJpeg(svg, width) {
    return new Promise((resolve, reject) => {
      const vb = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
      const height = Math.round((width * vb[3]) / vb[2]);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = width;
        c.height = height;
        const g = c.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, width, height);
        g.drawImage(img, 0, 0, width, height);
        resolve({ url: c.toDataURL('image/jpeg', 0.9), ratio: height / width });
      };
      img.onerror = () => reject(new Error('falha ao desenhar a chapa'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg width="${width}" height="${height}" `));
    });
  }

  // Chapas com o mesmo desenho viram uma só página (× N), como no Otimizador.
  function groupSheets(sheets) {
    const groups = [];
    const byKey = new Map();
    sheets.forEach((s, i) => {
      const key = [s.name, s.L, s.W, ...s.parts.map((p) => [p.piece, p.x, p.y, p.w, p.h].join(':'))].join('|');
      if (byKey.has(key)) byKey.get(key).count++;
      else {
        const g = { sheet: s, first: i + 1, count: 1 };
        byKey.set(key, g);
        groups.push(g);
      }
    });
    return groups;
  }

  async function buildPdf(project, opts) {
    await loadLibs();
    const { jsPDF } = global.jspdf;
    const result = global.Optimizer.optimize(project);
    const st = result.stats;
    const unit = project.unit || 'mm';
    const pieces = project.pieces;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const PW = 297;
    const PH = 210;
    const M = 14;
    const color = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };

    // Cabeçalho de cada página
    const logo = global.Logo ? await global.Logo.pngDataUrl() : null;
    const header = (subtitulo) => {
      if (logo) doc.addImage(logo, 'PNG', M, 10, 13, 13, 'logo', 'FAST');
      const tx = logo ? M + 17 : M;
      doc.setFont('times', 'bold');
      doc.setFontSize(15);
      color(INK);
      doc.text(clean(opts.empresa || 'Marcenaria'), tx, 16);
      font('normal', 9);
      color(MUTED);
      doc.text(clean(subtitulo), tx, 21.5);
      font('bold', 8.5);
      color(WOOD);
      doc.text('P L A N O   D E   C O R T E', PW - M, 15, { align: 'right' });
      font('bold', 12);
      color(INK);
      doc.text(clean(project.name || 'Projeto'), PW - M, 21.5, { align: 'right' });
      doc.setDrawColor(WOOD[0], WOOD[1], WOOD[2]);
      doc.setLineWidth(0.6);
      doc.line(M, 26, PW - M, 26);
    };

    const tableBase = {
      theme: 'plain',
      margin: { left: M, right: M, top: 32, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: { top: 1.5, bottom: 1.5, left: 2, right: 2 }, lineColor: LINE },
      headStyles: { fillColor: WOOD_SOFT, textColor: WOOD, fontStyle: 'bold', fontSize: 7.8 },
      didParseCell: (d) => { if (d.section === 'body') d.cell.styles.lineWidth = { bottom: 0.2 }; },
    };

    // ---------- Página 1: resumo e lista de peças ----------
    header(`Gerado pelo Otimizador de Cortes${opts.orcamento ? ` para o orçamento ${opts.orcamento}` : ''}`);

    // Chapas usadas por tipo
    const tipos = new Map();
    result.sheets.forEach((s) => {
      const k = `${s.name}|${s.L}|${s.W}`;
      const t = tipos.get(k) || { nome: s.name, L: s.L, W: s.W, n: 0, area: 0, usada: 0 };
      t.n++;
      t.area += s.area;
      t.usada += s.usedArea;
      tipos.set(k, t);
    });
    doc.autoTable({
      ...tableBase,
      startY: 31,
      tableWidth: 150,
      head: [['Chapa', 'Medida', 'Qtd', 'Aproveitamento']],
      body: [...tipos.values()].map((t) => [clean(t.nome), `${nf(t.L)} x ${nf(t.W)} ${unit}`, String(t.n), `${nf((t.usada / t.area) * 100, 1)}%`]),
      columnStyles: { 2: { halign: 'right', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 30 } },
    });

    // Números do plano (ao lado das chapas)
    const numeros = [
      ['Chapas', String(st.sheetCount)],
      ['Peças', `${st.partsPlaced} de ${st.partsTotal}`],
      ['Aproveitamento', `${nf(st.efficiency * 100, 1)}%`],
      ['Fita de borda', `${nf(st.edgeLength / 1000, 2)} m`],
      ['Cortes', `${st.cutCount} (${nf(st.cutLength / 1000, 2)} m)`],
      ['Serra / refilo', `${nf(project.kerf, 1)} / ${nf(project.trim, 1)} ${unit}`],
    ];
    let ny = 33;
    numeros.forEach(([k, v]) => {
      font('normal', 8.5);
      color(MUTED);
      doc.text(k, 175, ny);
      font('bold', 9.5);
      color(INK);
      doc.text(clean(v), PW - M, ny, { align: 'right' });
      ny += 5.5;
    });

    let y = Math.max(doc.lastAutoTable.finalY, ny) + 6;
    if (result.unplaced.length) {
      font('bold', 9.5);
      doc.setTextColor(180, 35, 24);
      const faltam = result.unplaced.map((u) => `${clean((pieces[u.piece] || {}).name || 'Peça')} (${u.count})`).join(', ');
      doc.splitTextToSize(`Atenção: não couberam nas chapas disponíveis: ${faltam}`, PW - 2 * M).forEach((l) => { doc.text(l, M, y); y += 4.6; });
      y += 2;
    }

    // Lista de peças
    const stockName = (id) => {
      const s = (project.stocks || []).find((x) => x.id === id);
      return s ? s.name : 'Qualquer';
    };
    const veio = { length: 'Comprimento', width: 'Largura' };
    const fita = (e) => {
      if (!e) return '-';
      const n = ['c1', 'c2', 'l1', 'l2'].filter((k) => e[k]).length;
      return n ? `${n} ${n === 1 ? 'lado' : 'lados'}` : '-';
    };
    font('bold', 10.5);
    color(INK);
    doc.text('Peças', M, y);
    doc.autoTable({
      ...tableBase,
      startY: y + 2,
      head: [['Peça', 'Comprimento', 'Largura', 'Qtd', 'Chapa', 'Veio', 'Fita de borda']],
      body: pieces.filter((p) => p.enabled !== false && +p.length > 0 && +p.width > 0 && +p.qty > 0).map((p) => [
        clean(p.name || 'Peça'), `${nf(p.length, +p.length % 1 ? 1 : 0)} ${unit}`, `${nf(p.width, +p.width % 1 ? 1 : 0)} ${unit}`,
        String(p.qty), clean(stockName(p.stock)), veio[p.grain] || 'Livre', fita(p.edges),
      ]),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', cellWidth: 12 } },
      didDrawPage: (d) => { if (d.pageNumber > 1) header('Peças (continuação)'); },
    });

    // ---------- Uma página por desenho de chapa ----------
    const grupos = groupSheets(result.sheets);
    const vista = { showLabels: true, showEdges: true, showOffcuts: true, showOrder: false, fontScale: 1, mono: false, vertical: false, unit };
    for (let gi = 0; gi < grupos.length; gi++) {
      const g = grupos[gi];
      doc.addPage();
      const s = g.sheet;
      const quais = g.count > 1 ? `Chapas ${g.first} a ${g.first + g.count - 1}` : `Chapa ${g.first}`;
      header(`${quais} de ${result.sheets.length}  |  ${s.name}  |  ${nf(s.L)} x ${nf(s.W)} ${unit}${g.count > 1 ? `  |  x${g.count} iguais` : ''}  |  aproveitamento ${nf(s.efficiency * 100, 1)}%`);
      const svg = global.Render.sheetSVG(s, pieces, { ...vista, key: 'pdf' + gi });
      const img = await sheetJpeg(svg, 2400);
      // Cabe na área livre mantendo a proporção
      const areaW = PW - 2 * M;
      const areaH = PH - 32 - 12;
      let w = areaW;
      let h = w * img.ratio;
      if (h > areaH) {
        h = areaH;
        w = h / img.ratio;
      }
      doc.addImage(img.url, 'JPEG', (PW - w) / 2, 31, w, h);
    }

    // Rodapé
    const pages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      font('normal', 7.5);
      color(MUTED);
      doc.text(clean(`${opts.empresa || ''}  |  ${project.name || ''}`), M, PH - 6);
      doc.text(`Página ${p} de ${pages}`, PW - M, PH - 6, { align: 'right' });
    }
    doc.setProperties({ title: `Plano de corte - ${clean(project.name)}`, creator: 'Orçamentos - Marcenaria Dier' });

    const nome = `Plano de corte - ${clean(project.name || 'projeto').replace(/[\\/:*?"<>|]+/g, '-')}.pdf`;
    return { file: new File([doc.output('blob')], nome, { type: 'application/pdf' }), stats: st, unplaced: result.unplaced.length };
  }

  global.PlanoCorte = { listProjects, loadProject, projectFromFile, buildPdf, loadLibs };
})(window);
