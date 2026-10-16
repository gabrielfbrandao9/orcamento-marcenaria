/*
 * Orçamentos - Marcenaria Dier: telas e interação.
 *
 * Telas (pelo endereço #/...):
 *   #/orcamentos      lista de orçamentos
 *   #/orcamento/<id>  editor de um orçamento
 *   #/clientes        cadastro de clientes
 *   #/catalogo        materiais com preço de custo
 *   #/ajustes         dados da marcenaria, valores padrão, conta e backup
 */
(function () {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const view = $('#view');

  const CATEGORIAS = [
    'Chapas', 'Fitas de borda', 'Dobradiças', 'Corrediças', 'Puxadores', 'Ferragens', 'Fixação e colas',
    'Vidros e espelhos', 'Iluminação', 'Tintas e acabamentos', 'Acessórios', 'Serviços terceirizados', 'Outros',
  ];
  const UNIDADES = ['chapa', 'm', 'm²', 'un', 'par', 'pç', 'cx', 'kg', 'L', 'serviço'];
  // Unidade sugerida ao escolher a categoria de um material novo
  const UNIDADE_PADRAO = {
    'Chapas': 'chapa', 'Fitas de borda': 'm', 'Corrediças': 'par', 'Vidros e espelhos': 'm²',
    'Iluminação': 'm', 'Tintas e acabamentos': 'L', 'Serviços terceirizados': 'serviço',
  };
  const STATUS = [
    { id: 'pendente', label: 'Pendente' },
    { id: 'aprovado', label: 'Aprovado' },
    { id: 'recusado', label: 'Recusado' },
    { id: 'producao', label: 'Em produção' },
    { id: 'entregue', label: 'Entregue' },
  ];
  const STATUS_LABEL = Object.fromEntries(STATUS.map((s) => [s.id, s.label]));

  const DEFAULT_CONFIG = {
    nome: 'Marcenaria Dier',
    endereco: 'Rua Luiz Barroso Lima, 25',
    bairro: 'Barateiro',
    cidade: 'Itapajé - CE',
    telefone: '(85) 99204-8433',
    documento: '',
    email: '',
    maoDeObraPct: 100,
    descontoVistaPct: 5,
    parcelasMax: 10,
    jurosPct: 0,
    condicoes: '50% de entrada na aprovação do orçamento e 50% na entrega.\nPix, dinheiro ou cartão.',
  };

  // Lista inicial opcional do catálogo (preços de referência: confira e ajuste).
  const EXEMPLOS = [
    ['MDF Branco TX 15 mm (2,75 x 1,85 m)', 'Chapas', 'chapa', 289],
    ['MDF Branco TX 18 mm (2,75 x 1,85 m)', 'Chapas', 'chapa', 339],
    ['MDF Amadeirado 15 mm (2,75 x 1,85 m)', 'Chapas', 'chapa', 389],
    ['MDF Branco 6 mm (2,75 x 1,85 m)', 'Chapas', 'chapa', 145],
    ['Fundo HDF Branco 3 mm (2,75 x 1,85 m)', 'Chapas', 'chapa', 79],
    ['Fita de borda branca 22 mm', 'Fitas de borda', 'm', 0.9],
    ['Fita de borda amadeirada 22 mm', 'Fitas de borda', 'm', 1.6],
    ['Dobradiça curva 35 mm com amortecedor', 'Dobradiças', 'un', 9.9],
    ['Dobradiça reta 35 mm com amortecedor', 'Dobradiças', 'un', 9.9],
    ['Corrediça telescópica 45 cm', 'Corrediças', 'par', 32],
    ['Corrediça telescópica 50 cm', 'Corrediças', 'par', 36],
    ['Puxador perfil alumínio', 'Puxadores', 'm', 35],
    ['Puxador alça 128 mm', 'Puxadores', 'un', 12],
    ['Pé regulável plástico', 'Ferragens', 'un', 3.5],
    ['Suporte de prateleira (pino)', 'Ferragens', 'un', 0.3],
    ['Parafuso 4,0 x 40 mm (caixa com 100)', 'Fixação e colas', 'cx', 18],
    ['Cola branca PVA', 'Fixação e colas', 'kg', 24],
    ['Espelho 4 mm', 'Vidros e espelhos', 'm²', 180],
    ['Fita de LED 12 V (luz quente)', 'Iluminação', 'm', 15],
    ['Verniz PU', 'Tintas e acabamentos', 'L', 65],
    ['Cabideiro oval alumínio', 'Acessórios', 'm', 28],
  ];

  const NUM_FIELDS = ['maoDeObraPct', 'margemPct', 'frete', 'instalacao', 'descontoVistaPct', 'parcelasMax', 'jurosPct'];
  const MONEY_FIELDS = ['frete', 'instalacao'];

  let user = null;
  let installPrompt = null;
  let current = { name: '', id: null };
  let editing = null; // orçamento aberto no editor (cópia de trabalho)
  let saveTimer = null;
  let cfgDraft = null; // configuração sendo editada em Ajustes
  let cfgTimer = null;
  let refreshPending = false;
  const filters = { orcamentos: { q: '', status: '' }, clientes: { q: '' }, catalogo: { q: '', cat: '' } };

  // ---------- Utilitários ----------

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (n) => BRL.format(n || 0);
  const num = (n, d = 2) => (n === '' || n == null || isNaN(n) ? '' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d, useGrouping: false }));
  const moneyNum = (n) => (n ? Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }) : '');
  const pad3 = (n) => String(n || 0).padStart(3, '0');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const byName = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR', { sensitivity: 'base' });

  // Aceita "1.234,56", "12,5" e "12.5".
  function parseNum(s) {
    if (typeof s === 'number') return s;
    let t = String(s || '').trim().replace(/\s|R\$|%/g, '');
    if (!t) return 0;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function whatsLink(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d;
    return d.length >= 12 ? `https://wa.me/${d}` : '';
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function growTextarea(t) {
    t.style.height = 'auto';
    t.style.height = t.scrollHeight + 2 + 'px';
  }

  const ICON = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    clip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.6-2.5h6.4L16.8 7h2.7A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5"/></svg>',
  };

  // ---------- Dados ----------

  function getConfig() {
    const list = Store.all('config').sort((a, b) => (a.id < b.id ? -1 : 1));
    return { ...DEFAULT_CONFIG, ...(list[0] || {}) };
  }

  function materials() {
    return Store.all('material')
      .map((m) => ({ ...m, categoria: CATEGORIAS.includes(m.categoria) ? m.categoria : 'Outros' }))
      .sort((a, b) => CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria) || byName(a, b));
  }

  const clients = () => Store.all('cliente').sort(byName);
  const quotes = () => Store.all('orcamento').sort((a, b) => (b.numero || 0) - (a.numero || 0));
  const indexById = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

  function clientName(q, cById) {
    const c = q.clienteId && (cById ? cById[q.clienteId] : Store.get(q.clienteId));
    return (c && c.nome) || q.clienteNome || '';
  }

  function nextNumber() {
    return Store.all('orcamento').reduce((max, q) => Math.max(max, q.numero || 0), 0) + 1;
  }

  const newItem = () => ({ id: Store.uuid(), materialId: '', nome: '', unidade: '', preco: 0, qtd: 1 });
  const newMovel = () => ({ id: Store.uuid(), nome: '', qtd: 1, descricao: '', itens: [newItem()] });

  // Garante que o orçamento tenha todos os campos (registros antigos ou importados).
  function normalizeQuote(q) {
    const cfg = getConfig();
    const out = {
      numero: 0, data: today(), status: 'pendente', clienteId: '', clienteNome: '', titulo: '',
      maoDeObraPct: cfg.maoDeObraPct, margemPct: 0, frete: 0, instalacao: 0,
      descontoVistaPct: cfg.descontoVistaPct, parcelasMax: cfg.parcelasMax, jurosPct: cfg.jurosPct,
      condicoes: '', observacoes: '', ...q,
    };
    if (!STATUS_LABEL[out.status]) out.status = 'pendente';
    out.moveis = (q.moveis || []).map((m) => ({
      nome: '', qtd: 1, descricao: '', ...m,
      id: m.id || Store.uuid(),
      itens: (m.itens || []).map((it) => ({ materialId: '', nome: '', unidade: '', preco: 0, qtd: 1, ...it, id: it.id || Store.uuid() })),
    }));
    return out;
  }

  // Orçamento criado e deixado em branco: é descartado ao sair dele.
  function isBlank(q) {
    return !q.clienteId && !(q.titulo || '').trim() && !(q.observacoes || '').trim()
      && (q.moveis || []).every((m) => !(m.nome || '').trim() && !(m.descricao || '').trim()
        && (m.itens || []).every((it) => !it.materialId && !it.nome && !it.preco))
      && !Anexos.list(q.id).length;
  }

  // ---------- Navegação ----------

  function leaveEditor() {
    if (!editing) return;
    flushSave();
    if (isBlank(editing) && Store.get(editing.id)) {
      Store.remove(editing.id);
      toast('Orçamento em branco descartado');
    }
    editing = null;
  }

  function onRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/');
    const name = parts[0] || 'orcamentos';
    const id = parts[1] || null;
    if (editing && !(name === 'orcamento' && id === editing.id)) leaveEditor();
    if (current.name === 'ajustes' && name !== 'ajustes') flushConfig();
    current = { name, id };
    const nav = name === 'orcamento' ? 'orcamentos' : name;
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === nav));
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    refreshPending = false;
    switch (current.name) {
      case 'orcamento': return renderEditor(current.id);
      case 'clientes': return renderClients();
      case 'catalogo': return renderCatalog();
      case 'ajustes': return renderSettings();
      default: return renderQuotes();
    }
  }

  function isTyping() {
    const a = document.activeElement;
    return !!a && view.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  }

  // Dados chegaram da nuvem: redesenha a tela, mas sem atrapalhar quem está digitando.
  function refreshFromRemote(ids) {
    if (current.name === 'orcamento' && editing) {
      if (ids && ids.length && !ids.includes(editing.id) && !ids.some((id) => ['material', 'cliente'].includes(Store.tipoDe(id)))) return;
      if (saveTimer) return; // há alteração local ainda não salva; ela vence
    }
    if (isTyping() || $$('dialog[open]').length) {
      refreshPending = true;
      return;
    }
    const y = window.scrollY;
    if (current.name === 'orcamento') editing = null;
    if (current.name === 'ajustes') cfgDraft = null;
    render();
    window.scrollTo(0, y);
  }

  view.addEventListener('focusout', () => {
    setTimeout(() => { if (refreshPending && !isTyping()) refreshFromRemote(); }, 200);
  });

  // ---------- Avisos no topo das páginas ----------

  function banners() {
    const st = Store.status();
    if (st === 'no-table') {
      return `<div class="banner danger"><p><strong>A nuvem ainda não está pronta:</strong> falta criar a tabela no Supabase
        (veja o arquivo SUPABASE.md). Enquanto isso, tudo fica salvo neste aparelho.</p></div>`;
    }
    if (Cloud.enabled && !user) {
      return `<div class="banner"><p>Os dados estão salvos <strong>só neste aparelho</strong>. Entre na sua conta para
        guardar na nuvem e usar no celular e no computador.</p><button type="button" class="btn small" data-act="login">Entrar</button></div>`;
    }
    return '';
  }

  // ---------- Lista de orçamentos ----------

  function chip(key, value, label, n, on) {
    return `<button type="button" class="chip${on ? ' on' : ''}" data-act="filter" data-key="${key}" data-value="${esc(value)}">${esc(label)} <span class="n">${n}</span></button>`;
  }

  function renderQuotes() {
    const all = quotes();
    const f = filters.orcamentos;
    const counts = {};
    all.forEach((q) => { counts[q.status] = (counts[q.status] || 0) + 1; });
    let body;
    if (all.length) {
      body = `<div class="toolbar"><input type="search" id="search" placeholder="Buscar cliente, número ou móvel" value="${esc(f.q)}" aria-label="Buscar orçamentos"></div>
        <div class="chips">${chip('status', '', 'Todos', all.length, !f.status)}${STATUS.filter((s) => counts[s.id] || f.status === s.id).map((s) => chip('status', s.id, s.label, counts[s.id] || 0, f.status === s.id)).join('')}</div>
        <div class="list" id="results"></div>`;
    } else if (!Store.all('material').length) {
      body = `<div class="empty"><strong>Vamos começar pelo catálogo</strong>
        <p>Cadastre as chapas, fitas de borda e ferragens que você usa, com o preço de custo. Depois é só montar os orçamentos.</p>
        <a class="btn primary" href="#/catalogo">Abrir o catálogo</a><button type="button" class="btn" data-act="new-quote">Novo orçamento</button></div>`;
    } else {
      body = `<div class="empty"><strong>Nenhum orçamento ainda</strong><p>Crie o primeiro orçamento: escolha o cliente, adicione os móveis e os materiais de cada um.</p>
        <button type="button" class="btn primary" data-act="new-quote">${ICON.plus} Novo orçamento</button></div>`;
    }
    view.innerHTML = `${banners()}
      <div class="page-head"><h2>Orçamentos</h2>
        <div class="actions"><button type="button" class="btn primary" data-act="new-quote">${ICON.plus} Novo orçamento</button></div></div>
      ${body}`;
    if (all.length) fillQuotes(all);
  }

  function fillQuotes(all) {
    const box = $('#results');
    if (!box) return;
    all = all || quotes();
    const f = filters.orcamentos;
    const cById = indexById(clients());
    const words = norm(f.q).split(/\s+/).filter(Boolean);
    const list = all.filter((q) => {
      if (f.status && q.status !== f.status) return false;
      if (!words.length) return true;
      const text = norm([pad3(q.numero), q.numero, clientName(q, cById), q.titulo, ...(q.moveis || []).map((m) => m.nome)].join(' '));
      return words.every((w) => text.includes(w));
    });
    if (!list.length) {
      box.innerHTML = '<p class="muted">Nenhum orçamento encontrado.</p>';
      return;
    }
    const nArquivos = Anexos.countByQuote();
    box.innerHTML = list.map((q) => {
      const c = Calc.quote(q);
      const moveis = (q.moveis || []).filter((m) => m.nome).map((m) => m.nome);
      const desc = q.titulo || moveis.join(', ') || 'Sem descrição';
      const n = (q.moveis || []).length;
      const arq = nArquivos[q.id] || 0;
      return `<a class="qcard" href="#/orcamento/${q.id}">
        <span class="qnum">Nº ${pad3(q.numero)}</span>
        <span class="qmain"><strong>${esc(clientName(q, cById) || 'Sem cliente')}</strong>
          <span>${esc(desc)} · ${n} ${n === 1 ? 'móvel' : 'móveis'}${arq ? ` · ${arq} ${arq === 1 ? 'arquivo' : 'arquivos'}` : ''}</span></span>
        <span class="qside"><span class="badge s-${q.status}">${STATUS_LABEL[q.status] || ''}</span>
          <span class="money">${money(c.total)}</span><small>${fmtDate(q.data)}</small></span>
      </a>`;
    }).join('');
  }

  function newQuote(clienteId) {
    const cfg = getConfig();
    const c = clienteId ? Store.get(clienteId) : null;
    const q = Store.put('orcamento', normalizeQuote({
      numero: nextNumber(),
      data: today(),
      status: 'pendente',
      clienteId: c ? c.id : '',
      clienteNome: c ? c.nome : '',
      moveis: [newMovel()],
      condicoes: cfg.condicoes,
      criadoEm: Date.now(),
    }));
    location.hash = '#/orcamento/' + q.id;
  }

  // ---------- Editor do orçamento ----------

  function clientOptions(q) {
    const cs = clients();
    let h = '<option value="">Sem cliente</option>';
    if (q.clienteId && !cs.some((c) => c.id === q.clienteId)) {
      h += `<option value="${esc(q.clienteId)}" selected>${esc(q.clienteNome || 'Cliente excluído')}</option>`;
    }
    h += cs.map((c) => `<option value="${c.id}"${c.id === q.clienteId ? ' selected' : ''}>${esc(c.nome)}</option>`).join('');
    return h + '<option value="__new">+ Cadastrar novo cliente…</option>';
  }

  function materialOptions(it, mats) {
    let h = `<option value="">${mats.length ? 'Escolha o material…' : 'Catálogo vazio: cadastre um material'}</option>`;
    if (it.nome && !mats.some((m) => m.id === it.materialId)) {
      h += `<option value="${esc(it.materialId || '__old')}" selected>${esc(it.nome)} (fora do catálogo)</option>`;
    }
    CATEGORIAS.forEach((cat) => {
      const g = mats.filter((m) => m.categoria === cat);
      if (!g.length) return;
      h += `<optgroup label="${esc(cat)}">${g.map((m) => `<option value="${m.id}"${m.id === it.materialId ? ' selected' : ''}>${esc(m.nome)} · ${money(m.preco)}/${esc(m.unidade)}</option>`).join('')}</optgroup>`;
    });
    return h + '<option value="__new">+ Cadastrar novo material…</option>';
  }

  function itemHtml(it, mats) {
    return `<div class="item" data-i="${it.id}">
      <div class="mat"><select data-if="materialId" aria-label="Material">${materialOptions(it, mats)}</select></div>
      <div class="qty"><input inputmode="decimal" data-if="qtd" value="${esc(num(it.qtd, 3))}" aria-label="Quantidade" autocomplete="off"><span class="unit">${esc(it.unidade)}</span></div>
      <div class="price prefix" data-prefix="R$"><input inputmode="decimal" data-if="preco" value="${esc(moneyNum(it.preco))}" placeholder="0,00" aria-label="Preço unitário" autocomplete="off"></div>
      <span class="item-sub"><span class="lbl">Subtotal</span><span class="money" data-isub></span></span>
      <button type="button" class="icon del" data-act="del-item" aria-label="Remover material">×</button>
    </div>`;
  }

  function movelHtml(m, i, mats) {
    return `<section class="card movel" data-m="${m.id}">
      <div class="movel-head">
        <span class="movel-n">${i + 1}</span>
        <input class="movel-name" data-mf="nome" value="${esc(m.nome)}" placeholder="Nome do móvel (ex.: Armário aéreo)" aria-label="Nome do móvel" autocomplete="off">
        <label class="qty-inline">Qtd <input inputmode="numeric" data-mf="qtd" value="${m.qtd || 1}" aria-label="Quantidade deste móvel" autocomplete="off"></label>
        <details class="dropdown"><summary class="icon" aria-label="Opções do móvel">⋯</summary><div class="menu">
          <button type="button" data-act="dup-movel">Duplicar móvel</button>
          <button type="button" data-act="up-movel">Mover para cima</button>
          <button type="button" data-act="down-movel">Mover para baixo</button>
          <hr><button type="button" class="danger" data-act="del-movel">Remover móvel</button>
        </div></details>
      </div>
      <textarea class="movel-desc" data-mf="descricao" rows="1" placeholder="Descrição (opcional): medidas, cor, acabamento">${esc(m.descricao)}</textarea>
      <div class="items">
        <div class="items-head"><span>Material</span><span class="r">Qtd</span><span class="r">Preço un.</span><span class="r">Subtotal</span><span></span></div>
        ${m.itens.length ? m.itens.map((it) => itemHtml(it, mats)).join('') : '<div class="no-items">Nenhum material neste móvel.</div>'}
      </div>
      <div class="movel-foot">
        <button type="button" class="btn small" data-act="add-item">${ICON.plus} Material</button>
        <span class="movel-total" data-mtotal></span>
      </div>
    </section>`;
  }

  function field(f, label, kind) {
    const q = editing;
    const v = kind === 'money' ? moneyNum(q[f]) : num(q[f]);
    const wrap = kind === 'money' ? 'prefix" data-prefix="R$' : kind === 'pct' ? 'suffix" data-suffix="%' : '';
    return `<label class="field"><span>${label}</span><span class="${wrap}"><input inputmode="${kind === 'int' ? 'numeric' : 'decimal'}" data-f="${f}" value="${esc(v)}" placeholder="0" autocomplete="off"></span></label>`;
  }

  function canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }));
    } catch (e) {
      return false;
    }
  }

  function renderEditor(id) {
    if (!editing || editing.id !== id) {
      const q = Store.tipoDe(id) === 'orcamento' ? Store.get(id) : null;
      if (!q) {
        view.innerHTML = `<div class="empty"><strong>Orçamento não encontrado</strong><p>Ele pode ter sido excluído.</p>
          <a class="btn" href="#/orcamentos">Voltar aos orçamentos</a></div>`;
        return;
      }
      editing = normalizeQuote(q);
    }
    const q = editing;
    const share = canShareFiles();
    view.innerHTML = `
      <div class="page-head editor-head">
        <a class="btn ghost" href="#/orcamentos">${ICON.back} Orçamentos</a>
        <h2>Orçamento <span class="mono">Nº ${pad3(q.numero)}</span></h2>
        <select class="status-select s-${q.status}" data-f="status" aria-label="Situação do orçamento">
          ${STATUS.map((s) => `<option value="${s.id}"${s.id === q.status ? ' selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <div class="actions">
          <details class="dropdown"><summary class="btn">Mais ▾</summary><div class="menu">
            <button type="button" data-act="dup-quote">Duplicar orçamento</button>
            <hr><button type="button" class="danger" data-act="del-quote">Excluir orçamento</button>
          </div></details>
        </div>
      </div>
      <div class="editor-grid">
        <div class="col-main">
          <section class="card">
            <div class="grid-fields">
              <div class="field"><span>Cliente</span>
                <div class="client-pick"><select data-f="clienteId" aria-label="Cliente">${clientOptions(q)}</select></div></div>
              <label class="field"><span>Data</span><input type="date" data-f="data" value="${esc(q.data)}"></label>
              <label class="field wide"><span>Projeto</span><input data-f="titulo" value="${esc(q.titulo)}" placeholder="Ex.: Cozinha planejada em MDF branco" autocomplete="off"></label>
            </div>
          </section>
          <div id="moveis"></div>
          <button type="button" class="btn add-movel" data-act="add-movel">${ICON.plus} Adicionar móvel</button>
          <section class="card">
            <label class="field"><span>Condições de pagamento</span><textarea data-f="condicoes" rows="3">${esc(q.condicoes)}</textarea></label>
            <label class="field" style="margin-top:12px"><span>Observações</span><textarea data-f="observacoes" rows="2" placeholder="Opcional: prazo de entrega, o que não está incluso…">${esc(q.observacoes)}</textarea></label>
          </section>
          <section class="card files-card" id="filesCard">
            <div class="card-head"><h3>Arquivos</h3></div>
            <div class="files" id="files"></div>
            <div class="file-actions">
              <label class="btn small">${ICON.clip} Adicionar arquivo<input type="file" id="fileAdd" multiple hidden></label>
              <label class="btn small camera-btn">${ICON.camera} Tirar foto<input type="file" id="fileCam" accept="image/*" capture="environment" hidden></label>
            </div>
            <p class="files-hint">Foto do móvel pronto, PDF do plano de corte, projeto… Ficam guardados neste orçamento
              (não vão no PDF do cliente).<span class="drop-hint"> Também dá para arrastar arquivos para cá.</span></p>
          </section>
        </div>
        <aside class="col-side">
          <section class="card">
            <div class="card-head"><h3>Valores</h3></div>
            <div class="values">
              ${field('maoDeObraPct', 'Mão de obra', 'pct')}
              ${Number(editing.margemPct) > 0 ? field('margemPct', 'Margem de lucro (antiga)', 'pct') : ''}
              ${field('frete', 'Frete', 'money')}
              ${field('instalacao', 'Instalação', 'money')}
              ${field('descontoVistaPct', 'Desconto à vista', 'pct')}
              ${field('parcelasMax', 'Parcelas (até)', 'int')}
              ${field('jurosPct', 'Juros ao mês', 'pct')}
            </div>
            <div id="stale"></div>
            <div id="summary"></div>
          </section>
          <section class="card">
            <div class="card-head"><h3>PDF para o cliente</h3></div>
            <div class="pdf-actions">
              ${share ? `<button type="button" class="btn primary" data-act="pdf-share">Enviar PDF</button>` : `<button type="button" class="btn primary" data-act="pdf-download">Baixar PDF</button>`}
              <button type="button" class="btn" data-act="pdf-open">Ver / imprimir</button>
              ${share ? `<button type="button" class="btn" data-act="pdf-download">Baixar</button>` : `<button type="button" class="btn" data-act="whats-client">WhatsApp</button>`}
            </div>
          </section>
        </aside>
      </div>`;
    renderMoveis();
    renderFiles();
  }

  function renderMoveis() {
    const mats = materials();
    $('#moveis').innerHTML = editing.moveis.map((m, i) => movelHtml(m, i, mats)).join('');
    $$('.movel-desc', view).forEach(growTextarea);
    updateTotals();
  }

  function staleItems() {
    const mById = indexById(Store.all('material'));
    const out = [];
    editing.moveis.forEach((m) => m.itens.forEach((it) => {
      const mat = mById[it.materialId];
      if (mat && Math.abs((Number(mat.preco) || 0) - (Number(it.preco) || 0)) > 0.004) out.push([it, mat]);
    }));
    return out;
  }

  function updateTotals() {
    if (!editing || !$('#summary')) return;
    const q = editing;
    const c = Calc.quote(q);
    const stale = new Set(staleItems().map(([it]) => it.id));
    q.moveis.forEach((m, i) => {
      const el = view.querySelector(`[data-m="${m.id}"]`);
      if (!el) return;
      m.itens.forEach((it) => {
        const row = el.querySelector(`[data-i="${it.id}"]`);
        if (!row) return;
        row.querySelector('[data-isub]').textContent = money(Calc.itemTotal(it));
        row.classList.toggle('stale', stale.has(it.id));
      });
      const mc = c.moveis[i];
      el.querySelector('[data-mtotal]').innerHTML = mc.qtd > 1
        ? `${money(mc.unit)} × ${mc.qtd} = <strong class="money">${money(mc.total)}</strong>`
        : `Total do móvel: <strong class="money">${money(mc.total)}</strong>`;
    });

    $('#stale').innerHTML = stale.size
      ? `<div class="notice"><span>${stale.size === 1 ? '1 material está' : `${stale.size} materiais estão`} com preço diferente do catálogo.</span>
          <button type="button" class="btn small" data-act="refresh-prices">Usar preços do catálogo</button></div>`
      : '';

    $('#summary').innerHTML = `<table class="summary">
        <tr><td>Materiais</td><td>${money(c.materiais)}</td></tr>
        <tr><td>Mão de obra <small>(${num(q.maoDeObraPct)}%)</small></td><td>${money(c.maoDeObra)}</td></tr>
        ${c.margem ? `<tr><td>Margem de lucro <small>(${num(q.margemPct)}%)</small></td><td>${money(c.margem)}</td></tr>` : ''}
        <tr><td>Frete</td><td>${money(c.frete)}</td></tr>
        <tr><td>Instalação</td><td>${money(c.instalacao)}</td></tr>
        <tr class="total"><td>Total</td><td>${money(c.total)}</td></tr>
      </table>
      <div class="pay">
        <div>À vista${c.descontoPct ? ` <small class="muted">(${num(c.descontoPct)}% de desconto)</small>` : ''}: <strong>${money(c.vista)}</strong></div>
        ${c.parcelas > 1 ? `<div>Ou até ${c.parcelas}× de <strong>${money(c.valorParcela)}</strong> ${c.jurosPct ? `<small class="muted">(juros de ${num(c.jurosPct)}% ao mês)</small>` : 'sem juros'}</div>` : ''}
      </div>`;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (editing) Store.put('orcamento', editing);
  }

  function findMovel(el) {
    const box = el.closest('[data-m]');
    return box ? editing.moveis.find((m) => m.id === box.dataset.m) : null;
  }

  function findItem(el, m) {
    const row = el.closest('[data-i]');
    return row && m ? m.itens.find((it) => it.id === row.dataset.i) : null;
  }

  function applyMaterial(it, mat) {
    it.materialId = mat.id;
    it.nome = mat.nome;
    it.unidade = mat.unidade;
    it.preco = Number(mat.preco) || 0;
  }

  async function onEditorChange(t) {
    if (t.id === 'fileAdd' || t.id === 'fileCam') {
      const files = [...t.files];
      t.value = '';
      return addFiles(files);
    }
    if (t.dataset.f === 'status') {
      editing.status = t.value;
      t.className = `status-select s-${t.value}`;
      scheduleSave();
      return;
    }
    if (t.dataset.f === 'clienteId') {
      if (t.value === '__new') {
        const c = await editClient(null);
        if (c) {
          editing.clienteId = c.id;
          editing.clienteNome = c.nome;
          scheduleSave();
        }
        t.innerHTML = clientOptions(editing);
        return;
      }
      editing.clienteId = t.value;
      editing.clienteNome = t.value ? clientName({ clienteId: t.value }) : '';
      scheduleSave();
      return;
    }
    if (t.dataset.f && MONEY_FIELDS.includes(t.dataset.f)) {
      t.value = moneyNum(editing[t.dataset.f]);
      return;
    }
    if (t.dataset.if === 'materialId') {
      const m = findMovel(t);
      const it = findItem(t, m);
      if (!it) return;
      if (t.value === '__new') {
        const mat = await editMaterial(null);
        if (mat) applyMaterial(it, mat);
        scheduleSave();
        renderMoveis();
        return;
      }
      const mat = Store.get(t.value);
      if (mat && Store.tipoDe(t.value) === 'material') applyMaterial(it, mat);
      else if (!t.value) Object.assign(it, { materialId: '', nome: '', unidade: '', preco: 0 });
      const row = t.closest('[data-i]');
      row.querySelector('.unit').textContent = it.unidade;
      row.querySelector('[data-if="preco"]').value = moneyNum(it.preco);
      updateTotals();
      scheduleSave();
      return;
    }
    if (t.dataset.if === 'preco') t.value = moneyNum(parseNum(t.value));
    if (t.dataset.mf === 'qtd') t.value = findMovel(t).qtd;
  }

  function onEditorInput(t) {
    if (t.tagName === 'SELECT') return; // tratado no "change"
    if (t.dataset.f) {
      const f = t.dataset.f;
      editing[f] = NUM_FIELDS.includes(f) ? parseNum(t.value) : t.value;
    } else if (t.dataset.mf) {
      const m = findMovel(t);
      if (!m) return;
      const f = t.dataset.mf;
      m[f] = f === 'qtd' ? Math.max(1, Math.round(parseNum(t.value)) || 1) : t.value;
      if (t.tagName === 'TEXTAREA') growTextarea(t);
    } else if (t.dataset.if) {
      const m = findMovel(t);
      const it = findItem(t, m);
      if (!it) return;
      it[t.dataset.if] = parseNum(t.value);
    } else {
      return;
    }
    updateTotals();
    scheduleSave();
  }

  function moveMovel(m, delta) {
    const list = editing.moveis;
    const i = list.indexOf(m);
    const j = i + delta;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    renderMoveis();
    scheduleSave();
  }

  function editorAction(act, btn) {
    const m = findMovel(btn);
    switch (act) {
      case 'add-movel': {
        editing.moveis.push(newMovel());
        renderMoveis();
        scheduleSave();
        const last = $$('.movel-name', view).pop();
        if (last) last.focus();
        return true;
      }
      case 'del-movel': {
        const filled = m.itens.some((it) => it.materialId || it.preco);
        if (filled && !confirm(`Remover o móvel “${m.nome || 'sem nome'}” e os materiais dele?`)) return true;
        editing.moveis.splice(editing.moveis.indexOf(m), 1);
        renderMoveis();
        scheduleSave();
        return true;
      }
      case 'dup-movel': {
        const copy = Store.clone(m);
        copy.id = Store.uuid();
        copy.nome = m.nome ? `${m.nome} (cópia)` : '';
        copy.itens.forEach((it) => { it.id = Store.uuid(); });
        editing.moveis.splice(editing.moveis.indexOf(m) + 1, 0, copy);
        renderMoveis();
        scheduleSave();
        toast('Móvel duplicado');
        return true;
      }
      case 'up-movel': moveMovel(m, -1); return true;
      case 'down-movel': moveMovel(m, 1); return true;
      case 'add-item': {
        const it = newItem();
        m.itens.push(it);
        renderMoveis();
        scheduleSave();
        const sel = view.querySelector(`[data-i="${it.id}"] select`);
        if (sel) sel.focus();
        return true;
      }
      case 'del-item': {
        const it = findItem(btn, m);
        m.itens.splice(m.itens.indexOf(it), 1);
        renderMoveis();
        scheduleSave();
        return true;
      }
      case 'refresh-prices': {
        const list = staleItems();
        list.forEach(([it, mat]) => applyMaterial(it, mat));
        renderMoveis();
        scheduleSave();
        toast(`${list.length} ${list.length === 1 ? 'preço atualizado' : 'preços atualizados'} pelo catálogo`);
        return true;
      }
      case 'dup-quote': {
        flushSave();
        const copy = normalizeQuote(Store.clone(editing));
        delete copy.id;
        copy.numero = nextNumber();
        copy.data = today();
        copy.status = 'pendente';
        copy.margemPct = 0;
        copy.criadoEm = Date.now();
        copy.moveis.forEach((mv) => { mv.id = Store.uuid(); mv.itens.forEach((it) => { it.id = Store.uuid(); }); });
        const saved = Store.put('orcamento', copy);
        editing = null;
        location.hash = '#/orcamento/' + saved.id;
        toast(`Cópia criada: orçamento Nº ${pad3(saved.numero)}`);
        return true;
      }
      case 'del-quote': {
        const nome = clientName(editing);
        if (!confirm(`Excluir o orçamento Nº ${pad3(editing.numero)}${nome ? ` (${nome})` : ''}? Não dá para desfazer.`)) return true;
        clearTimeout(saveTimer);
        saveTimer = null;
        Anexos.removeForQuote(editing.id);
        Store.remove(editing.id);
        editing = null;
        location.hash = '#/orcamentos';
        toast('Orçamento excluído');
        return true;
      }
      case 'open-file': openFile(fileOf(btn)); return true;
      case 'share-file': shareFile(fileOf(btn)); return true;
      case 'del-file': {
        const a = fileOf(btn);
        if (!a || !confirm(`Apagar o arquivo “${a.nome}” deste orçamento?`)) return true;
        Anexos.remove(a);
        dropThumb(a.id);
        renderFiles();
        toast('Arquivo apagado');
        return true;
      }
      case 'pdf-open': pdfOpen(); return true;
      case 'pdf-download': pdfDownload(); return true;
      case 'pdf-share': pdfShare(); return true;
      case 'whats-client': {
        const c = editing.clienteId && Store.get(editing.clienteId);
        const link = c && whatsLink(c.telefone);
        if (!link) {
          toast('Cadastre o telefone do cliente para abrir o WhatsApp.');
          return true;
        }
        window.open(link, '_blank', 'noopener');
        return true;
      }
      default: return false;
    }
  }

  // ---------- Arquivos do orçamento ----------

  const thumbs = new Map(); // id do anexo -> URL da miniatura

  function dropThumb(id) {
    const url = thumbs.get(id);
    if (url) URL.revokeObjectURL(url);
    thumbs.delete(id);
  }

  const fileOf = (el) => {
    const box = el.closest('[data-anexo]');
    return box ? Store.get(box.dataset.anexo) : null;
  };

  const FILE_STATUS = {
    nuvem: 'Na nuvem',
    enviando: 'Enviando…',
    local: 'Só neste aparelho',
    erro: 'Não subiu para a nuvem',
    remoto: 'Aguardando o outro aparelho enviar',
  };

  function fileKind(a) {
    if (Anexos.isPdf(a)) return 'PDF';
    if (Anexos.isImage(a)) return 'Foto';
    const m = String(a.nome || '').match(/\.([a-z0-9]{1,6})$/i);
    return m ? m[1].toUpperCase() : 'Arquivo';
  }

  function fileHtml(a) {
    const st = Anexos.status(a);
    const kind = fileKind(a);
    const icon = Anexos.isImage(a) ? ICON.image : `<span class="file-ext">${esc(kind.slice(0, 4))}</span>`;
    const err = st === 'erro' ? ` title="${esc(Anexos.error(a.id))}"` : '';
    const share = canShareFiles();
    return `<div class="file" data-anexo="${a.id}">
      <button type="button" class="file-thumb${Anexos.isPdf(a) ? ' pdf' : ''}" data-act="open-file" aria-label="Abrir ${esc(a.nome)}">${icon}</button>
      <div class="file-info">
        <button type="button" class="file-name" data-act="open-file">${esc(a.nome)}</button>
        <small>${kind} · ${Anexos.fmtSize(a.tamanho)} · <span class="fst fst-${st}"${err}>${FILE_STATUS[st]}</span></small>
      </div>
      <button type="button" class="icon" data-act="share-file" title="${share ? 'Enviar ou salvar' : 'Baixar'}" aria-label="${share ? 'Enviar ou salvar' : 'Baixar'}">${share ? ICON.share : ICON.download}</button>
      <button type="button" class="icon del" data-act="del-file" aria-label="Apagar arquivo">×</button>
    </div>`;
  }

  function renderFiles() {
    const box = $('#files');
    if (!box || !editing) return;
    const list = Anexos.list(editing.id);
    const aviso = Anexos.bucketMissing()
      ? '<p class="files-warn">Os arquivos ainda não sobem para a nuvem: falta rodar o <strong>schema.sql</strong> atualizado no Supabase (veja SUPABASE.md). Eles estão salvos neste aparelho.</p>'
      : '';
    box.innerHTML = aviso + (list.length ? list.map(fileHtml).join('') : '<p class="no-files">Nenhum arquivo.</p>');
    // Miniaturas das fotos (do aparelho ou baixadas da nuvem)
    list.filter(Anexos.isImage).forEach(async (a) => {
      let url = thumbs.get(a.id);
      if (!url) {
        try {
          url = URL.createObjectURL(await Anexos.getBlob(a));
          thumbs.set(a.id, url);
        } catch (e) {
          return;
        }
      }
      const el = box.querySelector(`[data-anexo="${a.id}"] .file-thumb`);
      if (el) el.innerHTML = `<img src="${url}" alt="">`;
    });
  }

  let filesTimer;
  function renderFilesSoon() {
    clearTimeout(filesTimer);
    filesTimer = setTimeout(renderFiles, 80);
  }

  async function addFiles(files) {
    if (!files.length || !editing) return;
    flushSave();
    toast(files.length > 1 ? `Salvando ${files.length} arquivos…` : 'Salvando arquivo…', 10000);
    try {
      const r = await Anexos.add(editing.id, files);
      renderFiles();
      if (r.skipped.length) toast(`Arquivo grande demais (máximo de 20 MB): ${r.skipped.join(', ')}`, 6000);
      else toast(r.added.length === 1 ? 'Arquivo adicionado' : `${r.added.length} arquivos adicionados`);
    } catch (err) {
      toast('Não foi possível salvar o arquivo: ' + err.message, 6000);
    }
  }

  async function openFile(a) {
    if (!a) return;
    if (Anexos.isImage(a)) {
      const dlg = $('#dlgViewer');
      $('#viewerName').textContent = a.nome;
      $('#viewerImg').removeAttribute('src');
      dlg.dataset.anexo = a.id;
      dlg.showModal();
      try {
        const blob = await Anexos.getBlob(a);
        if (!thumbs.has(a.id)) thumbs.set(a.id, URL.createObjectURL(blob));
        $('#viewerImg').src = thumbs.get(a.id);
      } catch (err) {
        dlg.close();
        toast('Não foi possível abrir: ' + err.message, 6000);
      }
      return;
    }
    // PDF e outros: abre numa aba nova (aberta já, para o navegador não bloquear)
    const w = window.open('', '_blank');
    try {
      const blob = await Anexos.getBlob(a);
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else download(blob, a.nome);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      if (w) w.close();
      toast('Não foi possível abrir: ' + err.message, 6000);
    }
  }

  async function shareFile(a) {
    if (!a) return;
    let blob;
    try {
      blob = await Anexos.getBlob(a);
      const file = new File([blob], a.nome, { type: a.tipo || blob.type });
      if (canShareFiles() && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: a.nome });
      else download(blob, a.nome);
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (blob) download(blob, a.nome);
      else toast('Não foi possível baixar: ' + err.message, 6000);
    }
  }

  // Arrastar arquivos para o cartão "Arquivos" (computador)
  const filesCardOf = (e) => (e.target.closest ? e.target.closest('#filesCard') : null);
  view.addEventListener('dragover', (e) => {
    const card = filesCardOf(e);
    if (!card || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    card.classList.add('drag');
  });
  view.addEventListener('dragleave', (e) => {
    const card = filesCardOf(e);
    if (card && !card.contains(e.relatedTarget)) card.classList.remove('drag');
  });
  view.addEventListener('drop', (e) => {
    const card = filesCardOf(e);
    if (!card) return;
    e.preventDefault();
    card.classList.remove('drag');
    addFiles([...e.dataTransfer.files]);
  });

  // ---------- PDF ----------

  async function makePdf() {
    flushSave();
    const q = editing;
    const cliente = q.clienteId && Store.tipoDe(q.clienteId) === 'cliente' ? Store.get(q.clienteId) : null;
    const blob = await PDF.blob(q, { config: getConfig(), cliente, calc: Calc.quote(q) });
    return { blob, name: PDF.fileName(q, cliente) };
  }

  async function pdfOpen() {
    const w = window.open('', '_blank'); // abre já, para o navegador não bloquear
    try {
      const { blob, name } = await makePdf();
      const url = URL.createObjectURL(blob);
      if (w) w.location.href = url;
      else download(blob, name);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (err) {
      if (w) w.close();
      toast('Não foi possível gerar o PDF: ' + err.message, 6000);
    }
  }

  async function pdfDownload() {
    try {
      const { blob, name } = await makePdf();
      download(blob, name);
      toast(`PDF salvo: ${name}`);
    } catch (err) {
      toast('Não foi possível gerar o PDF: ' + err.message, 6000);
    }
  }

  async function pdfShare() {
    let pdf;
    try {
      pdf = await makePdf();
      const file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: pdf.name.replace(/\.pdf$/, '') });
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      if (pdf) {
        download(pdf.blob, pdf.name);
        toast('Não deu para abrir o compartilhamento; o PDF foi baixado.');
      } else {
        toast('Não foi possível gerar o PDF: ' + err.message, 6000);
      }
    }
  }

  // ---------- Diálogos de material e cliente ----------

  // Abre o diálogo; "Salvar" (ou Enter) chama onOk na hora do envio do formulário.
  function openDialog(dlg, onOk) {
    return new Promise((resolve) => {
      const form = dlg.querySelector('form');
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        form.removeEventListener('submit', onSubmit);
        dlg.removeEventListener('close', onClose);
        resolve(v);
        if (refreshPending) setTimeout(() => refreshFromRemote(), 50);
      };
      const onSubmit = (e) => { if (e.submitter && e.submitter.value === 'ok') finish(onOk()); };
      const onClose = () => finish(dlg.returnValue === 'deleted' ? 'deleted' : null);
      form.addEventListener('submit', onSubmit);
      dlg.addEventListener('close', onClose);
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  function editMaterial(mat) {
    const dlg = $('#dlgMaterial');
    const f = $('#formMaterial');
    f.reset();
    $('#materialTitle').textContent = mat ? 'Editar material' : 'Novo material';
    f.nome.value = mat ? mat.nome : '';
    f.categoria.value = mat ? (CATEGORIAS.includes(mat.categoria) ? mat.categoria : 'Outros') : (filters.catalogo.cat || 'Chapas');
    f.unidade.value = mat ? mat.unidade : UNIDADE_PADRAO[f.categoria.value] || 'un';
    f.preco.value = mat ? moneyNum(mat.preco) : '';
    $('#btnDelMaterial').hidden = !mat;
    $('#btnDelMaterial').onclick = () => {
      if (!confirm(`Excluir “${mat.nome}” do catálogo?\n\nOs orçamentos já feitos continuam com este material.`)) return;
      Store.remove(mat.id);
      dlg.close('deleted');
      toast('Material excluído');
    };
    f.categoria.onchange = () => {
      if (!mat) f.unidade.value = UNIDADE_PADRAO[f.categoria.value] || 'un';
    };
    return openDialog(dlg, () => {
      const saved = Store.put('material', {
        ...(mat || {}),
        nome: f.nome.value.trim(),
        categoria: f.categoria.value,
        unidade: f.unidade.value,
        preco: Calc.r2(parseNum(f.preco.value)),
      });
      toast(mat ? 'Material atualizado' : 'Material cadastrado');
      return saved;
    });
  }

  function editClient(c) {
    const dlg = $('#dlgCliente');
    const f = $('#formCliente');
    f.reset();
    $('#clienteTitle').textContent = c ? 'Editar cliente' : 'Novo cliente';
    ['nome', 'telefone', 'endereco', 'cidade', 'obs'].forEach((k) => { f[k].value = c ? c[k] || '' : ''; });
    if (!c) f.cidade.value = 'Itapajé - CE';
    $('#btnDelCliente').hidden = !c;
    $('#btnDelCliente').onclick = () => {
      const n = Store.all('orcamento').filter((q) => q.clienteId === c.id).length;
      const extra = n ? `\n\nEle tem ${n} orçamento(s); eles continuam salvos, com o nome do cliente.` : '';
      if (!confirm(`Excluir o cliente “${c.nome}”?${extra}`)) return;
      Store.remove(c.id);
      dlg.close('deleted');
      toast('Cliente excluído');
    };
    return openDialog(dlg, () => {
      const saved = Store.put('cliente', {
        ...(c || {}),
        nome: f.nome.value.trim(),
        telefone: f.telefone.value.trim(),
        endereco: f.endereco.value.trim(),
        cidade: f.cidade.value.trim(),
        obs: f.obs.value.trim(),
      });
      // Mantém o nome guardado nos orçamentos dele (usado se o cliente for excluído).
      if (c && c.nome !== saved.nome) {
        const qs = Store.all('orcamento').filter((q) => q.clienteId === c.id).map((q) => ({ ...q, clienteNome: saved.nome }));
        if (qs.length) Store.putMany('orcamento', qs);
      }
      toast(c ? 'Cliente atualizado' : 'Cliente cadastrado');
      return saved;
    });
  }

  function openReajuste() {
    const dlg = $('#dlgReajuste');
    const f = $('#formReajuste');
    const mats = materials();
    f.reset();
    const counts = {};
    mats.forEach((m) => { counts[m.categoria] = (counts[m.categoria] || 0) + 1; });
    $('#reajusteCategoria').innerHTML = `<option value="">Todos (${mats.length})</option>`
      + CATEGORIAS.filter((c) => counts[c]).map((c) => `<option value="${esc(c)}">${esc(c)} (${counts[c]})</option>`).join('');
    const selected = () => mats.filter((m) => !f.categoria.value || m.categoria === f.categoria.value);
    const preview = () => {
      const pct = parseNum(f.pct.value);
      const list = selected();
      if (!pct || !list.length) {
        $('#reajustePreview').textContent = list.length ? `${list.length} materiais selecionados.` : '';
        return;
      }
      const ex = list[0];
      const novo = Calc.r2(ex.preco * (1 + pct / 100));
      $('#reajustePreview').textContent = `${list.length} ${list.length === 1 ? 'material' : 'materiais'}. Exemplo: ${ex.nome}, de ${money(ex.preco)} para ${money(novo)}.`;
    };
    f.pct.oninput = preview;
    f.categoria.onchange = preview;
    preview();
    openDialog(dlg, () => {
      const pct = parseNum(f.pct.value);
      if (!pct) return null;
      const list = selected().map((m) => ({ ...m, preco: Calc.r2(m.preco * (1 + pct / 100)) }));
      Store.putMany('material', list);
      toast(`Reajuste de ${num(pct)}% aplicado em ${list.length} ${list.length === 1 ? 'material' : 'materiais'}`);
      return list;
    }).then((r) => { if (r && current.name === 'catalogo') renderCatalog(); });
  }

  // ---------- Catálogo ----------

  function renderCatalog() {
    const mats = materials();
    const f = filters.catalogo;
    const counts = {};
    mats.forEach((m) => { counts[m.categoria] = (counts[m.categoria] || 0) + 1; });
    if (f.cat && !counts[f.cat]) f.cat = '';
    view.innerHTML = `
      <div class="page-head"><h2>Catálogo</h2>
        <div class="actions">
          ${mats.length ? '<button type="button" class="btn" data-act="reajuste">Reajustar preços</button>' : ''}
          <button type="button" class="btn primary" data-act="new-material">${ICON.plus} Novo material</button>
        </div></div>
      ${mats.length ? `
        <div class="toolbar"><input type="search" id="search" placeholder="Buscar material" value="${esc(f.q)}" aria-label="Buscar material"></div>
        <div class="chips">${chip('cat', '', 'Todos', mats.length, !f.cat)}${CATEGORIAS.filter((c) => counts[c]).map((c) => chip('cat', c, c, counts[c], f.cat === c)).join('')}</div>
        <div id="results"></div>
        <p class="muted" style="font-size:13px;margin-top:16px">Preços de custo. Ao mudar um preço aqui, os orçamentos antigos não mudam;
          num orçamento aberto aparece o botão “Usar preços do catálogo”.</p>`
      : `<div class="empty"><strong>Catálogo vazio</strong>
          <p>Cadastre as chapas, fitas de borda, ferragens e outros materiais com o <strong>preço de custo</strong>. Nos orçamentos, é só escolher e informar a quantidade.</p>
          <button type="button" class="btn primary" data-act="new-material">${ICON.plus} Novo material</button><button type="button" class="btn" data-act="seed-materials">Começar com uma lista de exemplo</button></div>`}`;
    if (mats.length) fillCatalog(mats);
  }

  function fillCatalog(mats) {
    const box = $('#results');
    if (!box) return;
    mats = mats || materials();
    const f = filters.catalogo;
    const words = norm(f.q).split(/\s+/).filter(Boolean);
    const list = mats.filter((m) => (!f.cat || m.categoria === f.cat) && words.every((w) => norm(m.nome).includes(w)));
    if (!list.length) {
      box.innerHTML = '<p class="muted">Nenhum material encontrado.</p>';
      return;
    }
    box.innerHTML = CATEGORIAS.map((cat) => {
      const g = list.filter((m) => m.categoria === cat);
      if (!g.length) return '';
      return `<div class="group"><h3>${esc(cat)} <span class="n">${g.length}</span></h3><div class="rows">
        ${g.map((m) => `<button type="button" class="row" data-act="edit-material" data-id="${m.id}">
          <strong>${esc(m.nome)}</strong><span class="u">por ${esc(m.unidade)}</span><span class="money">${money(m.preco)}</span></button>`).join('')}
      </div></div>`;
    }).join('');
  }

  // ---------- Clientes ----------

  function renderClients() {
    const cs = clients();
    const f = filters.clientes;
    view.innerHTML = `
      <div class="page-head"><h2>Clientes</h2>
        <div class="actions"><button type="button" class="btn primary" data-act="new-client">${ICON.plus} Novo cliente</button></div></div>
      ${cs.length ? `<div class="toolbar"><input type="search" id="search" placeholder="Buscar por nome, telefone ou endereço" value="${esc(f.q)}" aria-label="Buscar clientes"></div>
        <div class="ccards" id="results"></div>`
      : `<div class="empty"><strong>Nenhum cliente cadastrado</strong><p>Guarde nome, telefone e endereço dos clientes para usar nos orçamentos.
          Também dá para cadastrar direto no orçamento.</p>
          <button type="button" class="btn primary" data-act="new-client">${ICON.plus} Novo cliente</button></div>`}`;
    if (cs.length) fillClients(cs);
  }

  function fillClients(cs) {
    const box = $('#results');
    if (!box) return;
    cs = cs || clients();
    const words = norm(filters.clientes.q).split(/\s+/).filter(Boolean);
    const list = cs.filter((c) => {
      const text = norm([c.nome, c.telefone, String(c.telefone || '').replace(/\D/g, ''), c.endereco, c.cidade].join(' '));
      return words.every((w) => text.includes(w));
    });
    const qs = quotes();
    if (!list.length) {
      box.innerHTML = '<p class="muted">Nenhum cliente encontrado.</p>';
      return;
    }
    box.innerHTML = list.map((c) => {
      const mine = qs.filter((q) => q.clienteId === c.id);
      const wa = whatsLink(c.telefone);
      const end = [c.endereco, c.cidade].filter(Boolean).join(' - ');
      return `<section class="card ccard">
        <div class="ccard-top"><strong>${esc(c.nome)}</strong>
          <button type="button" class="btn small ghost" data-act="edit-client" data-id="${c.id}">Editar</button></div>
        ${c.telefone ? `<p>${esc(c.telefone)}</p>` : ''}
        ${end ? `<p>${esc(end)}</p>` : ''}
        ${c.obs ? `<p><em>${esc(c.obs)}</em></p>` : ''}
        <div class="links">
          <button type="button" class="btn small" data-act="new-quote" data-client="${c.id}">${ICON.plus} Orçamento</button>
          ${mine.length ? `<button type="button" class="btn small" data-act="client-quotes" data-name="${esc(c.nome)}">${mine.length} ${mine.length === 1 ? 'orçamento' : 'orçamentos'}</button>` : ''}
          ${wa ? `<a class="btn small" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div>
      </section>`;
    }).join('');
  }

  // ---------- Ajustes ----------

  function cfgField(k, label, opts = {}) {
    const v = cfgDraft[k];
    if (opts.textarea) return `<label class="field"><span>${label}</span><textarea data-c="${k}" rows="3">${esc(v)}</textarea></label>`;
    if (opts.kind) {
      const wrap = opts.kind === 'pct' ? 'suffix" data-suffix="%' : '';
      return `<label class="field"><span>${label}</span><span class="${wrap}"><input inputmode="${opts.kind === 'int' ? 'numeric' : 'decimal'}" data-c="${k}" value="${esc(num(v))}" autocomplete="off"></span></label>`;
    }
    return `<label class="field"><span>${label}</span><input data-c="${k}" value="${esc(v)}" placeholder="${esc(opts.placeholder || '')}" autocomplete="off"></label>`;
  }

  function syncText() {
    const st = Store.status();
    const pend = Store.pendingCount();
    if (!Cloud.enabled) return 'A nuvem não está configurada. Os dados ficam salvos neste aparelho; faça cópias de segurança.';
    if (!user) return 'Você não entrou na conta. Os dados ficam salvos só neste aparelho.';
    if (st === 'no-table') return 'A tabela do app ainda não foi criada no Supabase. Veja o arquivo SUPABASE.md.';
    if (st === 'offline') return `Sem internet. ${pend ? `${pend} alteração(ões) serão enviadas quando a conexão voltar.` : ''}`;
    if (st === 'error') return `Erro ao falar com a nuvem: ${(Store.lastError() || {}).message || 'tente de novo'}.`;
    if (st === 'saving') return 'Enviando alterações…';
    if (Anexos.bucketMissing()) return 'Os dados estão na nuvem, mas os arquivos dos orçamentos ainda não: falta rodar o schema.sql atualizado no Supabase (veja SUPABASE.md).';
    if (Anexos.uploading()) return 'Enviando arquivos para a nuvem…';
    return 'Tudo salvo na nuvem. Os dados aparecem em qualquer aparelho em que você entrar com esta conta.';
  }

  function renderSettings() {
    if (!cfgDraft) cfgDraft = getConfig();
    const email = user ? user.email || 'conta conectada' : '';
    view.innerHTML = `
      <div class="page-head"><h2>Ajustes</h2></div>
      ${banners()}
      <div class="settings">
        <section class="card">
          <div class="card-head"><h3>Dados da marcenaria</h3></div>
          <p class="muted" style="margin:0 0 4px">Aparecem no cabeçalho do PDF.</p>
          ${cfgField('nome', 'Nome')}
          ${cfgField('endereco', 'Endereço')}
          <div class="field-row">${cfgField('bairro', 'Bairro')}${cfgField('cidade', 'Cidade')}</div>
          <div class="field-row">${cfgField('telefone', 'Telefone / WhatsApp')}${cfgField('documento', 'CPF ou CNPJ', { placeholder: 'Opcional' })}</div>
          ${cfgField('email', 'E-mail', { placeholder: 'Opcional' })}
        </section>
        <section class="card">
          <div class="card-head"><h3>Valores padrão</h3></div>
          <p class="muted" style="margin:0 0 4px">Usados em cada orçamento novo. Em cada orçamento dá para mudar.</p>
          <div class="field-row">${cfgField('maoDeObraPct', 'Mão de obra (% dos materiais)', { kind: 'pct' })}${cfgField('descontoVistaPct', 'Desconto à vista', { kind: 'pct' })}</div>
          <div class="field-row">${cfgField('parcelasMax', 'Parcelas (até)', { kind: 'int' })}${cfgField('jurosPct', 'Juros ao mês (0 = sem juros)', { kind: 'pct' })}</div>
          ${cfgField('condicoes', 'Condições de pagamento', { textarea: true })}
        </section>
        <section class="card">
          <div class="card-head"><h3>Aparência</h3></div>
          <div class="segmented" role="group" aria-label="Tema">
            ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button type="button" data-act="theme" data-value="${v}" class="${themeChoice === v ? 'on' : ''}">${l}</button>`).join('')}
          </div>
          <p class="muted" style="margin:10px 0 0">Automático segue o tema do celular ou do computador. Também dá para trocar no botão
            <span aria-hidden="true">☀</span> do topo.</p>
        </section>
        <section class="card">
          <div class="card-head"><h3>Conta e nuvem</h3></div>
          ${email ? `<p>Conectado como <strong>${esc(email)}</strong>.</p>` : ''}
          <p class="muted" id="syncText">${esc(syncText())}</p>
          <div class="btn-row">
            ${Cloud.enabled ? (user ? '<button type="button" class="btn" data-act="sync-now">Sincronizar agora</button><button type="button" class="btn ghost" data-act="logout">Sair da conta</button>' : '<button type="button" class="btn primary" data-act="login">Entrar</button>') : ''}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Cópia de segurança</h3></div>
          <p class="muted">Baixe um arquivo com todos os orçamentos, clientes e materiais. Guarde no computador ou no Google Drive. As fotos e PDFs anexados não vão nesse arquivo: eles ficam na nuvem.</p>
          <div class="btn-row">
            <button type="button" class="btn" data-act="export">Baixar cópia (.json)</button>
            <button type="button" class="btn" data-act="import">Restaurar cópia</button>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h3>Aplicativo</h3></div>
          <p class="muted">No celular Android, abra o site no Chrome e toque em <strong>⋮ → Instalar app</strong> (ou “Adicionar à tela inicial”).
            O ícone da Marcenaria Dier aparece na tela inicial e o app funciona mesmo sem internet.</p>
          <div class="btn-row"><button type="button" class="btn primary" data-act="install" ${installPrompt ? '' : 'hidden'}>Instalar app</button></div>
        </section>
      </div>`;
  }

  function onConfigInput(t) {
    const k = t.dataset.c;
    cfgDraft[k] = t.inputMode === 'decimal' || t.inputMode === 'numeric' ? parseNum(t.value) : t.value;
    clearTimeout(cfgTimer);
    cfgTimer = setTimeout(flushConfig, 500);
  }

  function flushConfig() {
    if (!cfgTimer) return;
    clearTimeout(cfgTimer);
    cfgTimer = null;
    const saved = Store.put('config', cfgDraft);
    cfgDraft.id = saved.id;
  }

  function exportBackup() {
    const data = { app: 'orcamento-marcenaria', versao: 1, exportadoEm: new Date().toISOString(), registros: Store.exportAll() };
    download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `backup-orcamentos-${today()}.json`);
    toast('Cópia de segurança baixada');
  }

  function importBackup() {
    const input = $('#fileInput');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data || data.app !== 'orcamento-marcenaria' || !Array.isArray(data.registros)) throw new Error('não é uma cópia deste app');
        const n = data.registros.length;
        if (!confirm(`Restaurar ${n} itens da cópia de ${fmtDate((data.exportadoEm || '').slice(0, 10))}?\n\nOs itens do arquivo substituem os iguais que já estão aqui. Os demais continuam.`)) return;
        const done = Store.importAll(data.registros);
        cfgDraft = null;
        render();
        toast(`${done} itens restaurados`);
      } catch (err) {
        toast('Não foi possível ler o arquivo: ' + err.message, 6000);
      }
    };
    input.click();
  }

  // ---------- Eventos da página ----------

  view.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'search') {
      const f = filters[current.name];
      if (f) f.q = t.value;
      if (current.name === 'orcamentos') fillQuotes();
      else if (current.name === 'catalogo') fillCatalog();
      else if (current.name === 'clientes') fillClients();
      return;
    }
    if (t.dataset.c && cfgDraft) return onConfigInput(t);
    if (editing && current.name === 'orcamento') onEditorInput(t);
  });

  view.addEventListener('change', (e) => {
    if (editing && current.name === 'orcamento') onEditorChange(e.target);
    else if (e.target.dataset.c && cfgDraft) {
      const t = e.target;
      if (t.inputMode === 'decimal' || t.inputMode === 'numeric') t.value = num(cfgDraft[t.dataset.c]);
    }
  });

  // Um único "ouvinte" para todos os botões com data-act.
  document.addEventListener('click', async (e) => {
    $$('details.dropdown[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const menu = btn.closest('details.dropdown');
    if (menu && btn.tagName !== 'SUMMARY') menu.removeAttribute('open');

    if (editing && current.name === 'orcamento' && editorAction(act, btn)) return;

    switch (act) {
      case 'new-quote': return newQuote(btn.dataset.client);
      case 'filter': {
        const f = filters[current.name];
        f[btn.dataset.key] = btn.dataset.value;
        $$('.chip', view).forEach((c) => c.classList.toggle('on', c === btn));
        return current.name === 'orcamentos' ? fillQuotes() : fillCatalog();
      }
      case 'new-material': {
        const m = await editMaterial(null);
        if (m && current.name === 'catalogo') renderCatalog();
        return;
      }
      case 'edit-material': {
        const r = await editMaterial(Store.get(btn.dataset.id));
        if (r && current.name === 'catalogo') renderCatalog();
        return;
      }
      case 'seed-materials': {
        Store.putMany('material', EXEMPLOS.map(([nome, categoria, unidade, preco]) => ({ nome, categoria, unidade, preco })));
        renderCatalog();
        toast('Lista de exemplo adicionada. Confira e ajuste os preços de cada item.', 5000);
        return;
      }
      case 'reajuste': return openReajuste();
      case 'new-client':
      case 'edit-client': {
        const r = await editClient(act === 'edit-client' ? Store.get(btn.dataset.id) : null);
        if (r && current.name === 'clientes') renderClients();
        return;
      }
      case 'client-quotes': {
        filters.orcamentos = { q: btn.dataset.name, status: '' };
        location.hash = '#/orcamentos';
        return;
      }
      case 'login': return openLogin();
      case 'logout': return logout();
      case 'sync-now': return Store.sync(true);
      case 'sync-info': {
        if (Cloud.enabled && !user) return openLogin();
        if (['error', 'offline'].includes(Store.status())) Store.sync(true);
        return toast(syncText(), 5000);
      }
      case 'export': return exportBackup();
      case 'import': return importBackup();
      case 'install': return install();
      case 'toggle-theme': return setTheme(isDark() ? 'light' : 'dark');
      case 'theme': return setTheme(btn.dataset.value);
      default:
    }
  });

  // ---------- Status da nuvem ----------

  function renderSync() {
    const el = $('#syncStatus');
    const st = Store.status();
    const pend = Store.pendingCount();
    let text;
    let state = st;
    if (!Cloud.enabled) { text = 'Salvo no aparelho'; state = 'local'; }
    else if (!user) text = 'Só neste aparelho';
    else if (st === 'saving') text = 'Salvando…';
    else if (st === 'saved') text = 'Salvo na nuvem';
    else if (st === 'offline') text = pend ? `Sem internet · ${pend} pendente${pend > 1 ? 's' : ''}` : 'Sem internet';
    else if (st === 'no-table') text = 'Nuvem não configurada';
    else if (st === 'error') text = 'Erro ao salvar';
    else text = 'Só neste aparelho';
    if (Cloud.enabled && user && st === 'saved') {
      if (Anexos.bucketMissing()) { text = 'Arquivos sem nuvem'; state = 'no-table'; }
      else if (Anexos.uploading()) { text = 'Enviando arquivos…'; state = 'saving'; }
    }
    el.textContent = text;
    el.dataset.state = state;
    el.title = syncText();
    const st2 = $('#syncText');
    if (st2) st2.textContent = syncText();
  }

  let lastStatus = null;
  Store.on((ev) => {
    if (ev.type === 'change' && current.name === 'orcamento' && editing) renderFilesSoon();
    if (ev.type === 'status') {
      renderSync();
      if (ev.status === 'saved') Anexos.sync(); // dados em dia: envia o que faltar dos arquivos
      // A faixa de aviso da tabela aparece/some conforme o status.
      if ((ev.status === 'no-table') !== (lastStatus === 'no-table') && ['orcamentos', 'ajustes'].includes(current.name)) refreshFromRemote();
      lastStatus = ev.status;
    } else if (ev.type === 'change' && ev.source === 'remote') {
      refreshFromRemote(ev.ids);
    } else if (ev.type === 'error') {
      toast('Não foi possível salvar no aparelho: o armazenamento está cheio ou bloqueado.', 6000);
    }
  });

  // ---------- Conta ----------

  function renderAccount() {
    const box = $('#account');
    box.hidden = !Cloud.enabled;
    if (!Cloud.enabled) return;
    if (!user) {
      box.innerHTML = '<button type="button" class="btn" data-act="login">Entrar</button>';
      return;
    }
    const email = user.email || 'Conectado';
    const avatar = user.user_metadata && user.user_metadata.avatar_url;
    box.innerHTML = `<a class="user" href="#/ajustes" title="${esc(email)}">
      ${avatar ? `<img class="avatar" src="${esc(avatar)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar">${esc(email[0].toUpperCase())}</span>`}
    </a>`;
  }

  function loginMsg(text, isError) {
    const p = $('#loginMsg');
    p.textContent = text;
    p.classList.toggle('error', !!isError);
  }

  async function openLogin() {
    if (!Cloud.enabled) return;
    const active = await Cloud.providers();
    const google = Cloud.loginGoogle && (!active || active.google !== false);
    const email = Cloud.loginEmail && (!active || active.email !== false);
    $('#btnGoogle').hidden = !google;
    $('#emailLogin').hidden = !email;
    $('#loginSep').hidden = !(google && email);
    loginMsg('');
    $('#dlgLogin').showModal();
  }

  async function logout() {
    if (Store.pendingCount() && !confirm('Há alterações que ainda não foram enviadas para a nuvem. Sair mesmo assim? Elas continuam neste aparelho.')) return;
    try {
      await Cloud.signOut();
      toast('Você saiu da conta');
    } catch (err) {
      toast('Erro ao sair: ' + err.message);
    }
  }

  function bindAccount() {
    if (!Cloud.enabled) return;

    $('#btnGoogle').addEventListener('click', async () => {
      loginMsg('Abrindo o Google…');
      try {
        await Cloud.signInWithGoogle();
      } catch (err) {
        loginMsg('Não foi possível entrar com Google: ' + err.message, true);
      }
    });

    const sendEmail = async () => {
      const email = $('#loginEmail').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return loginMsg('Digite um e-mail válido.', true);
      const btn = $('#btnEmail');
      btn.disabled = true;
      loginMsg('Enviando…');
      try {
        await Cloud.signInWithEmail(email);
        loginMsg(`Pronto! Abra o link que enviamos para ${email} (confira também o spam).`);
      } catch (err) {
        loginMsg('Não foi possível enviar o link: ' + err.message, true);
      } finally {
        btn.disabled = false;
      }
    };
    $('#btnEmail').addEventListener('click', sendEmail);
    $('#loginEmail').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); sendEmail(); }
    });

    Cloud.onAuthChange((u, event) => {
      const previous = user;
      if ((u && u.id) === (previous && previous.id)) return; // renovação do login, nada mudou
      user = u;
      renderAccount();
      Store.setUser(u);
      Anexos.setUser(u);
      renderSync();
      if (u && !previous && event === 'SIGNED_IN') {
        if ($('#dlgLogin').open) $('#dlgLogin').close();
        toast(`Conectado como ${u.email || 'usuário'}`);
      }
      if (['orcamentos', 'ajustes'].includes(current.name) && !isTyping()) {
        if (current.name === 'ajustes') cfgDraft = null;
        render();
      }
    });
  }

  // ---------- Tema claro/escuro ----------
  // "auto" segue o aparelho; "light"/"dark" ficam guardados só neste aparelho.

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  let themeChoice = (() => {
    try {
      const t = localStorage.getItem('dier:tema');
      return t === 'light' || t === 'dark' ? t : 'auto';
    } catch (e) {
      return 'auto';
    }
  })();

  const isDark = () => themeChoice === 'dark' || (themeChoice === 'auto' && darkQuery.matches);

  function setTheme(choice) {
    themeChoice = choice;
    if (choice === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = choice;
    try {
      if (choice === 'auto') localStorage.removeItem('dier:tema');
      else localStorage.setItem('dier:tema', choice);
    } catch (e) { /* sem armazenamento: vale até fechar */ }
    renderTheme();
  }

  function renderTheme() {
    const dark = isDark();
    document.documentElement.classList.toggle('dark', dark);
    const label = dark ? 'Mudar para o modo claro' : 'Mudar para o modo escuro';
    const btn = $('#btnTheme');
    btn.title = label;
    btn.setAttribute('aria-label', label);
    $$('[data-act="theme"]', view).forEach((b) => b.classList.toggle('on', b.dataset.value === themeChoice));
  }

  darkQuery.addEventListener('change', renderTheme);

  // ---------- App instalável ----------

  async function install() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    $('#btnInstall').hidden = true;
  }

  function bindApp() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      installPrompt = e;
      $('#btnInstall').hidden = false;
      const b = view.querySelector('[data-act="install"]');
      if (b) b.hidden = false;
    });
    $('#btnInstall').addEventListener('click', install);
    window.addEventListener('appinstalled', () => {
      $('#btnInstall').hidden = true;
      toast('App instalado! Procure “Orçamentos” na tela inicial.');
    });

    window.addEventListener('online', () => { toast('Conexão restabelecida'); Store.sync(true); Anexos.sync(); });
    window.addEventListener('offline', () => { renderSync(); toast('Sem internet: pode continuar usando. As alterações sobem quando a conexão voltar.', 5000); });

    // Ao voltar para o app, busca o que mudou em outro aparelho; ao sair, envia o que falta.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') Store.sync(true);
      else { flushSave(); flushConfig(); Store.flush(); }
    });
    window.addEventListener('pagehide', () => { flushSave(); flushConfig(); });
    setInterval(() => { if (document.visibilityState === 'visible' && user) Store.sync(true); }, 90000);
  }

  // ---------- Início ----------

  function init() {
    $('#brandLogo').innerHTML = Logo.svg();
    renderTheme();
    Anexos.on(() => { renderSync(); if (current.name === 'orcamento' && editing) renderFilesSoon(); });
    Anexos.init();
    $('#viewerShare').addEventListener('click', () => shareFile(Store.get($('#dlgViewer').dataset.anexo)));
    $('#viewerShare').innerHTML = canShareFiles() ? `${ICON.share} Enviar` : `${ICON.download} Baixar`;
    Logo.pngDataUrl(); // prepara o logo do PDF
    $('#materialCategoria').innerHTML = CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('');
    $('#materialUnidade').innerHTML = UNIDADES.map((u) => `<option>${esc(u)}</option>`).join('');
    // Botões de fechar/cancelar não enviam o formulário: assim o Enter aciona o "Salvar".
    $$('dialog [value="cancel"], dialog [value="close"]').forEach((b) => {
      b.type = 'button';
      b.addEventListener('click', () => b.closest('dialog').close('cancel'));
    });

    window.addEventListener('hashchange', onRoute);
    bindApp();
    bindAccount();
    renderAccount();
    renderSync();
    onRoute();
  }

  init();
})();
