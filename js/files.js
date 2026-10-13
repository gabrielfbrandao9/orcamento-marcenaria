/*
 * Arquivos dos orçamentos (anexos): foto do móvel pronto, PDF do plano de corte etc.
 *
 * Cada anexo é um registro "anexo" no Store (nome, tipo, tamanho, orçamento e
 * caminho na nuvem), sincronizado como os demais. O conteúdo do arquivo fica:
 *   - no aparelho, no IndexedDB (cabe arquivo grande e funciona sem internet);
 *   - na nuvem, no Supabase Storage, assim que a conta estiver conectada.
 * Em outro aparelho, o arquivo é baixado da nuvem na primeira vez que é aberto.
 * Fotos grandes são reduzidas antes de salvar.
 */
(function (global) {
  'use strict';

  const MAX_BYTES = 20 * 1024 * 1024; // igual ao limite do bucket (schema.sql)
  const MAX_SIDE = 2000;              // maior lado das fotos, em pixels
  const DELETE_KEY = 'dier:anexos-apagar';
  const MIME_EXT = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/heic': '.heic',
    'application/pdf': '.pdf',
  };

  let user = null;
  let busy = false;
  let again = false;
  let bucketMissing = false;
  const errors = new Map();   // id do anexo -> mensagem do último erro de envio
  const localIds = new Set(); // anexos cujo arquivo está neste aparelho
  const listeners = new Set();

  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });

  // ---------- IndexedDB ----------

  let dbPromise = null;
  function idb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open('dier-arquivos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('blobs');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const t = db.transaction('blobs', mode);
      const req = fn(t.objectStore('blobs'));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const local = {
    get: (id) => tx('readonly', (s) => s.get(id)),
    put: async (id, blob) => { await tx('readwrite', (s) => s.put(blob, id)); localIds.add(id); },
    del: async (id) => { localIds.delete(id); await tx('readwrite', (s) => s.delete(id)); },
    keys: () => tx('readonly', (s) => s.getAllKeys()),
  };

  // ---------- Utilitários ----------

  const isImage = (a) => /^image\/(jpeg|png|webp|gif)$/.test(a.tipo || '');
  const isPdf = (a) => a.tipo === 'application/pdf' || /\.pdf$/i.test(a.nome || '');

  function ext(a) {
    const m = String(a.nome || '').match(/\.[a-z0-9]{1,6}$/i);
    return (m ? m[0] : MIME_EXT[a.tipo] || '').toLowerCase();
  }

  function fmtSize(n) {
    if (!n) return '0 KB';
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  }

  // Reduz fotos grandes (ex.: 4000 px e 5 MB do celular) para JPEG de até 2000 px.
  async function prepare(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || '') || !global.createImageBitmap) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
        bmp.close();
        return file;
      }
      const w = Math.round(bmp.width * scale);
      const h = Math.round(bmp.height * scale);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; // PNG transparente vira fundo branco
      g.fillRect(0, 0, w, h);
      g.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob || blob.size >= file.size) return file;
      const nome = (file.name || 'foto').replace(/\.(png|webp|jpe?g)$/i, '') + '.jpg';
      return new File([blob], nome, { type: 'image/jpeg' });
    } catch (e) {
      return file; // formato que o navegador não abre: guarda como veio
    }
  }

  function readDeletes() {
    try { return JSON.parse(localStorage.getItem(DELETE_KEY)) || []; } catch (e) { return []; }
  }
  function writeDeletes(list) {
    try { localStorage.setItem(DELETE_KEY, JSON.stringify(list)); } catch (e) { /* sem armazenamento */ }
  }
  function queueDelete(path) {
    const list = readDeletes();
    if (!list.includes(path)) list.push(path);
    writeDeletes(list);
  }

  // ---------- Envio para a nuvem ----------

  async function sync() {
    if (busy) {
      again = true;
      return;
    }
    if (!global.Cloud || !Cloud.enabled || !user || !navigator.onLine) return;
    busy = true;
    emit();
    try {
      // 1. Apaga da nuvem o que foi excluído aqui.
      const dels = readDeletes();
      if (dels.length) {
        try {
          await Cloud.removeFiles(dels);
          writeDeletes(readDeletes().filter((p) => !dels.includes(p)));
        } catch (err) {
          console.error(err);
        }
      }
      // 2. Envia os arquivos que ainda não subiram.
      for (const a of Store.all('anexo').filter((x) => !x.path)) {
        const blob = await local.get(a.id).catch(() => null);
        if (!blob) continue; // foi adicionado em outro aparelho, que ainda vai enviar
        const path = `${user.id}/${a.orcamentoId}/${a.id}${ext(a)}`;
        try {
          await Cloud.uploadFile(path, blob, a.tipo || 'application/octet-stream');
          bucketMissing = false;
          errors.delete(a.id);
          const atual = Store.get(a.id);
          if (atual) Store.put('anexo', { ...atual, path });
          else queueDelete(path); // foi apagado enquanto enviava
        } catch (err) {
          console.error(err);
          errors.set(a.id, err.message || String(err));
          if (Cloud.isMissingBucket(err)) {
            bucketMissing = true;
            break;
          }
        }
        emit();
      }
      // 3. Tira do aparelho os arquivos que foram apagados em outro aparelho.
      const ids = new Set(Store.all('anexo').map((x) => x.id));
      const keys = await local.keys().catch(() => []);
      for (const k of keys) if (!ids.has(k)) await local.del(k).catch(() => {});
    } finally {
      busy = false;
      emit();
      if (again) {
        again = false;
        sync();
      }
    }
  }

  const Anexos = {
    MAX_BYTES,
    isImage,
    isPdf,
    fmtSize,

    list(orcamentoId) {
      return Store.all('anexo')
        .filter((a) => a.orcamentoId === orcamentoId)
        .sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
    },

    countByQuote() {
      const n = {};
      Store.all('anexo').forEach((a) => { n[a.orcamentoId] = (n[a.orcamentoId] || 0) + 1; });
      return n;
    },

    // Salva os arquivos no aparelho e manda para a nuvem. Retorna { added, skipped }.
    async add(orcamentoId, files) {
      const added = [];
      const skipped = [];
      for (const original of files) {
        const file = await prepare(original);
        if (file.size > MAX_BYTES) {
          skipped.push(original.name);
          continue;
        }
        // O registro vem antes do arquivo: assim a limpeza do passo 3 nunca apaga um arquivo recém-salvo.
        const rec = Store.put('anexo', {
          orcamentoId,
          nome: file.name || 'arquivo',
          tipo: file.type || 'application/octet-stream',
          tamanho: file.size,
          path: '',
          criadoEm: Date.now(),
        });
        await local.put(rec.id, file);
        added.push(rec);
      }
      // Pede ao navegador para não apagar estes arquivos quando faltar espaço.
      if (added.length && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      emit();
      sync();
      return { added, skipped };
    },

    // Conteúdo do arquivo: do aparelho ou, se não estiver aqui, baixado da nuvem.
    async getBlob(a) {
      const cached = await local.get(a.id).catch(() => null);
      if (cached) return cached;
      if (!a.path) throw new Error('o arquivo ainda está no aparelho em que foi adicionado e não subiu para a nuvem');
      if (!user) throw new Error('entre na conta para baixar este arquivo da nuvem');
      const blob = await Cloud.downloadFile(a.path);
      const typed = blob.type && blob.type !== 'application/octet-stream' ? blob : new Blob([blob], { type: a.tipo });
      local.put(a.id, typed).catch(() => {});
      return typed;
    },

    remove(a) {
      Store.remove(a.id);
      errors.delete(a.id);
      local.del(a.id).catch(() => {});
      if (a.path) queueDelete(a.path);
      emit();
      sync();
    },

    removeForQuote(orcamentoId) {
      this.list(orcamentoId).forEach((a) => this.remove(a));
    },

    // nuvem | enviando | local | erro | remoto (só no outro aparelho, ainda não enviado)
    status(a) {
      if (a.path) return 'nuvem';
      if (!localIds.has(a.id)) return 'remoto';
      if (errors.has(a.id)) return 'erro';
      return global.Cloud && Cloud.enabled && user ? 'enviando' : 'local';
    },

    error: (id) => errors.get(id) || '',
    uploading: () => Store.all('anexo').some((a) => !a.path && localIds.has(a.id) && !errors.has(a.id)),
    bucketMissing: () => bucketMissing,

    setUser(u) {
      user = u;
      if (u) sync();
    },

    sync,

    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Descobre quais arquivos já estão neste aparelho.
    async init() {
      try {
        (await local.keys()).forEach((k) => localIds.add(k));
      } catch (e) { /* sem IndexedDB */ }
      emit();
    },
  };

  global.Anexos = Anexos;
})(window);
