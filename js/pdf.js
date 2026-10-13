/*
 * PDF do orçamento (jsPDF + jsPDF-AutoTable).
 *
 * Mostra tudo detalhado: os materiais de cada móvel, linha a linha, e o resumo
 * com materiais, mão de obra, margem de lucro, frete, instalação, total,
 * valor à vista e parcelado, além das condições de pagamento.
 *
 * As fontes padrão do PDF só têm caracteres do português "comum": evite
 * símbolos como − ou … nos textos fixos.
 */
(function (global) {
  'use strict';

  const WOOD = [123, 74, 38];
  const WOOD_SOFT = [244, 234, 220];
  const INK = [35, 28, 21];
  const MUTED = [117, 104, 90];
  const LINE = [222, 212, 198];

  const PAGE_W = 210;
  const PAGE_H = 297;
  const M = 15; // margem lateral
  const BOTTOM = PAGE_H - 15;

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => BRL.format(n || 0).replace(/ /g, ' ');
  const num = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const pct = (n) => `${num(n)}%`;
  const date = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
  // Troca caracteres que as fontes padrão do PDF não têm.
  const clean = (s) => String(s || '')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '');

  function numero(q) {
    return String(q.numero || 0).padStart(3, '0');
  }

  function fileName(q, cliente) {
    const nome = clean((cliente && cliente.nome) || q.clienteNome || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
    return `Orcamento-${numero(q)}${nome ? '-' + nome : ''}.pdf`;
  }

  async function build(q, ctx) {
    const { jsPDF } = global.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const cfg = ctx.config;
    const c = ctx.calc;
    const cliente = ctx.cliente;
    let y;

    const color = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
    const ensure = (h) => {
      if (y + h > BOTTOM) {
        doc.addPage();
        y = 20;
      }
    };

    // ---------- Cabeçalho ----------
    const logo = await global.Logo.pngDataUrl();
    if (logo) doc.addImage(logo, 'PNG', M, 12, 21, 21, 'logo', 'FAST');
    const tx = logo ? M + 26 : M;

    doc.setFont('times', 'bold');
    doc.setFontSize(21);
    color(INK);
    doc.text(clean(cfg.nome || 'Marcenaria'), tx, 20.5);

    font('normal', 8.8);
    color(MUTED);
    const linha1 = [cfg.endereco, cfg.bairro].filter(Boolean).join(' - ');
    const linha2 = [cfg.cidade, cfg.telefone && `WhatsApp ${cfg.telefone}`].filter(Boolean).join('  |  ');
    const linha3 = [cfg.documento, cfg.email].filter(Boolean).join('  |  ');
    let hy = 26;
    [linha1, linha2, linha3].filter(Boolean).forEach((l) => { doc.text(clean(l), tx, hy); hy += 4.2; });

    font('bold', 8.5);
    color(WOOD);
    doc.text('O R Ç A M E N T O', PAGE_W - M, 17, { align: 'right' });
    font('bold', 17);
    color(INK);
    doc.text(`Nº ${numero(q)}`, PAGE_W - M, 24.5, { align: 'right' });
    font('normal', 9);
    color(MUTED);
    doc.text(date(q.data), PAGE_W - M, 30, { align: 'right' });

    y = Math.max(hy, 34) + 2;
    doc.setDrawColor(WOOD[0], WOOD[1], WOOD[2]);
    doc.setLineWidth(0.7);
    doc.line(M, y, PAGE_W - M, y);
    y += 7;

    // ---------- Cliente ----------
    font('bold', 7.5);
    color(MUTED);
    doc.text('CLIENTE', M, y);
    y += 5;
    font('bold', 11.5);
    color(INK);
    doc.text(clean((cliente && cliente.nome) || q.clienteNome || 'Não informado'), M, y);
    y += 5;
    const contato = cliente ? [cliente.telefone, [cliente.endereco, cliente.cidade].filter(Boolean).join(' - ')].filter(Boolean).join('  |  ') : '';
    if (contato) {
      font('normal', 9);
      color(MUTED);
      doc.splitTextToSize(clean(contato), PAGE_W - 2 * M).forEach((l) => { doc.text(l, M, y); y += 4.3; });
    }
    if (q.titulo) {
      y += 2;
      font('bold', 7.5);
      color(MUTED);
      doc.text('PROJETO', M, y);
      y += 5;
      font('bold', 11.5);
      color(INK);
      doc.splitTextToSize(clean(q.titulo), PAGE_W - 2 * M).forEach((l) => { doc.text(l, M, y); y += 5; });
    }
    y += 4;

    const tableBase = {
      theme: 'plain',
      margin: { left: M, right: M, top: 20, bottom: PAGE_H - BOTTOM },
      styles: { font: 'helvetica', fontSize: 9, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: LINE, overflow: 'linebreak' },
      headStyles: { fillColor: WOOD_SOFT, textColor: WOOD, fontStyle: 'bold', fontSize: 8 },
      footStyles: { fillColor: false, textColor: INK, fontStyle: 'bold' },
    };

    // ---------- Móveis ----------
    (q.moveis || []).forEach((m, idx) => {
      const mc = c.moveis[idx];
      ensure(24);
      font('bold', 11);
      color(INK);
      const titulo = `${idx + 1}. ${clean(m.nome || 'Móvel sem nome')}`;
      doc.text(titulo, M, y);
      if (mc.qtd > 1) {
        const w = doc.getTextWidth(titulo);
        font('normal', 9.5);
        color(MUTED);
        doc.text(`(${mc.qtd} unidades)`, M + w + 2, y);
      }
      y += 4.5;
      if (m.descricao) {
        font('normal', 8.8);
        color(MUTED);
        doc.splitTextToSize(clean(m.descricao), PAGE_W - 2 * M).forEach((l) => { ensure(5); doc.text(l, M, y); y += 4; });
      }
      y += 0.5;

      const itens = (m.itens || []).filter((it) => it.nome || it.qtd || it.preco);
      const body = itens.map((it) => [
        clean(it.nome || 'Material'),
        num(it.qtd),
        clean(it.unidade || ''),
        money(it.preco),
        money(global.Calc.itemTotal(it)),
      ]);
      if (!body.length) body.push([{ content: 'Nenhum material informado', colSpan: 5, styles: { textColor: MUTED, fontStyle: 'italic' } }]);
      const foot = mc.qtd > 1
        ? [
          [{ content: 'Subtotal por unidade', colSpan: 4, styles: { halign: 'right', fontStyle: 'normal', textColor: MUTED } }, money(mc.unit)],
          [{ content: `Total do móvel (${mc.qtd} unidades)`, colSpan: 4, styles: { halign: 'right' } }, money(mc.total)],
        ]
        : [[{ content: 'Total do móvel', colSpan: 4, styles: { halign: 'right' } }, money(mc.total)]];

      doc.autoTable({
        ...tableBase,
        startY: y,
        head: [['Material', 'Qtd', 'Unid.', 'Preço un.', 'Subtotal']],
        body,
        foot,
        showFoot: 'lastPage',
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { halign: 'right', cellWidth: 16 },
          2: { cellWidth: 16 },
          3: { halign: 'right', cellWidth: 28 },
          4: { halign: 'right', cellWidth: 30 },
        },
        didParseCell: (d) => {
          if (d.section === 'head' && d.column.index !== 0 && d.column.index !== 2) d.cell.styles.halign = 'right';
          if (d.section === 'body') d.cell.styles.lineWidth = { bottom: 0.2 };
          if (d.section === 'foot') d.cell.styles.halign = 'right';
          if (d.section === 'foot' && d.row.index === d.table.foot.length - 1) d.cell.styles.lineWidth = { top: 0.4 };
        },
      });
      y = doc.lastAutoTable.finalY + 8;
    });

    // ---------- Resumo ----------
    ensure(70);
    font('bold', 11);
    color(INK);
    doc.text('Resumo do orçamento', M, y);
    y += 2;
    const resumo = [
      ['Materiais', money(c.materiais)],
      [`Mão de obra (${pct(q.maoDeObraPct)} sobre os materiais)`, money(c.maoDeObra)],
      [`Margem de lucro (${pct(q.margemPct)} sobre materiais + mão de obra)`, money(c.margem)],
    ];
    if (c.frete) resumo.push(['Frete', money(c.frete)]);
    if (c.instalacao) resumo.push(['Instalação', money(c.instalacao)]);
    doc.autoTable({
      ...tableBase,
      startY: y,
      body: resumo,
      foot: [['TOTAL', money(c.total)]],
      styles: { ...tableBase.styles, fontSize: 9.5 },
      footStyles: { fillColor: WOOD, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 11.5, cellPadding: 2.6 },
      columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
      didParseCell: (d) => {
        if (d.section === 'body') d.cell.styles.lineWidth = { bottom: 0.2 };
        if (d.section === 'foot' && d.column.index === 1) d.cell.styles.halign = 'right';
      },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ---------- Formas de pagamento ----------
    const formas = [];
    if (c.descontoPct > 0) formas.push(['À vista', `${money(c.vista)}  (${pct(c.descontoPct)} de desconto)`]);
    else formas.push(['À vista', money(c.total)]);
    if (c.parcelas > 1) {
      const juros = c.jurosPct > 0 ? `com juros de ${pct(c.jurosPct)} ao mês (total ${money(c.totalParcelado)})` : 'sem juros';
      formas.push(['Parcelado', `até ${c.parcelas}x de ${money(c.valorParcela)} ${juros}`]);
    }
    ensure(8 + formas.length * 6);
    formas.forEach(([k, v]) => {
      font('bold', 10);
      color(INK);
      doc.text(k, M, y);
      font('normal', 10);
      doc.text(clean(v), M + 26, y);
      y += 6;
    });
    y += 3;

    // ---------- Textos ----------
    const bloco = (titulo, texto) => {
      if (!texto || !texto.trim()) return;
      const linhas = doc.splitTextToSize(clean(texto.trim()), PAGE_W - 2 * M);
      ensure(Math.min(7 + (linhas.length - 1) * 4.6, 40)); // título e texto juntos na mesma página
      font('bold', 7.5);
      color(MUTED);
      doc.text(titulo, M, y);
      y += 5;
      font('normal', 9.5);
      color(INK);
      linhas.forEach((l) => { ensure(2); doc.text(l, M, y); y += 4.6; });
      y += 4;
    };
    bloco('CONDIÇÕES DE PAGAMENTO', q.condicoes);
    bloco('OBSERVAÇÕES', q.observacoes);

    // ---------- Rodapé ----------
    const pages = doc.internal.getNumberOfPages();
    const rodape = clean([cfg.nome, cfg.telefone, cfg.cidade].filter(Boolean).join('  |  '));
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
      doc.setLineWidth(0.3);
      doc.line(M, PAGE_H - 12, PAGE_W - M, PAGE_H - 12);
      font('normal', 7.8);
      color(MUTED);
      doc.text(rodape, M, PAGE_H - 7.5);
      doc.text(`Página ${p} de ${pages}`, PAGE_W - M, PAGE_H - 7.5, { align: 'right' });
    }

    doc.setProperties({ title: `Orçamento ${numero(q)}`, author: clean(cfg.nome), creator: 'Orçamentos - Marcenaria Dier' });
    return doc;
  }

  async function blob(q, ctx) {
    if (!global.jspdf || !global.jspdf.jsPDF) throw new Error('o gerador de PDF não carregou. Verifique a internet e abra o app de novo.');
    return (await build(q, ctx)).output('blob');
  }

  global.PDF = { blob, fileName };
})(window);
