/*
 * Dados do app: guardados no aparelho (localStorage) e sincronizados com a nuvem.
 *
 * Cada registro tem { id, tipo, dados, excluido, alterado_em }. Toda alteração
 * é gravada primeiro no aparelho e marcada como "pendente"; depois é enviada
 * ao Supabase. Ao abrir o app (e ao voltar para ele), os registros da nuvem são
 * baixados e combinados com os do aparelho: em cada registro, vence a
 * alteração mais recente. Assim o app funciona sem internet e os dados
 * aparecem no celular e no computador.
 *
 * Os dados do aparelho são de um espaço só (db.owner): a equipe da conta ou,
 * sem equipe, a própria conta. A cada vez que baixa da nuvem, o app confere
 * a equipe; se ela mudou (entrou, saiu ou foi removido), começa do zero com
 * os dados do espaço novo.
 */
(function (global) {
  'use strict';

  const KEY = 'dier:db';
  const PUSH_DELAY = 1200;

  let db = load();
  let user = null;
  let syncing = false;
  let again = false;
  let pullAgain = false;
  let pushTimer = null;
  let status = 'local';
  let lastError = null;
  let equipe = null;         // resposta de Cloud.equipe()
  let equipeJson = '';
  let semEquipes = false;    // o banco ainda não tem as funções de equipe (schema.sql antigo)
  let equipeConferida = false;
  const listeners = new Set();

  // owner: espaço dos dados (equipe ou conta); user: conta que entrou neste aparelho.
  function empty(userId) {
    return { records: {}, dirty: {}, owner: null, user: userId || null };
  }

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      // Antes das equipes, owner era o id da conta.
      if (d && d.records) return { records: d.records, dirty: d.dirty || {}, owner: d.owner || null, user: d.user || d.owner || null };
    } catch (e) { /* sem armazenamento ou dados corrompidos */ }
    return empty();
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch (e) {
      emit({ type: 'error', error: e });
    }
  }

  function emit(ev) {
    listeners.forEach((fn) => { try { fn(ev); } catch (e) { console.error(e); } });
  }

  function setStatus(s, err) {
    status = s;
    lastError = err || null;
    emit({ type: 'status', status: s, error: lastError });
  }

  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function write(rec) {
    const prev = db.records[rec.id];
    // O horário precisa crescer sempre, mesmo com duas alterações no mesmo milissegundo.
    rec.alterado_em = Math.max(Date.now(), prev ? prev.alterado_em + 1 : 0);
    db.records[rec.id] = rec;
    db.dirty[rec.id] = true;
  }

  function pendingCount() {
    return Object.keys(db.dirty).length;
  }

  function schedulePush(delay) {
    clearTimeout(pushTimer);
    if (!user) return;
    pushTimer = setTimeout(() => sync(false), delay == null ? PUSH_DELAY : delay);
  }

  // Combina os registros da nuvem com os do aparelho. Retorna os ids que mudaram aqui.
  function merge(remote) {
    const changed = [];
    const seen = new Set();
    remote.forEach((r) => {
      r.alterado_em = Number(r.alterado_em);
      seen.add(r.id);
      const l = db.records[r.id];
      if (!l || r.alterado_em > l.alterado_em) {
        db.records[r.id] = { id: r.id, tipo: r.tipo, dados: r.dados, excluido: !!r.excluido, alterado_em: r.alterado_em };
        delete db.dirty[r.id];
        changed.push(r.id);
      } else if (l.alterado_em > r.alterado_em) {
        db.dirty[r.id] = true;
      }
    });
    // O que só existe no aparelho (criado sem login ou sem internet) sobe para a nuvem.
    Object.keys(db.records).forEach((id) => { if (!seen.has(id)) db.dirty[id] = true; });
    return changed;
  }

  // Confere a equipe da conta. Se o espaço mudou, os dados do aparelho são de
  // outro espaço: começa do zero e baixa os do espaço novo.
  async function loadTeam() {
    let e = null;
    try {
      e = await Cloud.equipe();
      semEquipes = false;
    } catch (err) {
      if (!Cloud.isMissingFunction(err)) throw err;
      semEquipes = true;
    }
    const espaco = e ? e.equipe_id : user.id;
    if (db.owner && db.owner !== espaco) {
      db = empty(user.id);
      emit({ type: 'change', source: 'remote', ids: [] });
    }
    db.owner = espaco;
    persist();
    equipeConferida = true;
    const json = JSON.stringify(e);
    if (json !== equipeJson) {
      equipeJson = json;
      equipe = e;
      emit({ type: 'team', equipe: e });
    }
  }

  async function sync(pull) {
    if (!global.Cloud || !Cloud.enabled || !user) {
      setStatus('local');
      return;
    }
    if (syncing) {
      again = true;
      pullAgain = pullAgain || pull;
      return;
    }
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    syncing = true;
    setStatus('saving');
    try {
      if (pull || !equipeConferida) {
        await loadTeam();
        const changed = merge(await Cloud.pullAll());
        persist();
        if (changed.length) emit({ type: 'change', source: 'remote', ids: changed });
      }
      const ids = Object.keys(db.dirty);
      if (ids.length) {
        const recs = ids.map((id) => db.records[id]).filter(Boolean);
        const sent = recs.map((r) => [r.id, r.alterado_em]);
        await Cloud.push(recs, semEquipes ? null : db.owner);
        // Só tira da fila o que não foi alterado de novo durante o envio.
        sent.forEach(([id, t]) => { if (db.records[id] && db.records[id].alterado_em === t) delete db.dirty[id]; });
        ids.forEach((id) => { if (!db.records[id]) delete db.dirty[id]; });
        persist();
      }
      setStatus(pendingCount() ? 'saving' : 'saved');
    } catch (err) {
      console.error(err);
      if (err && err.code === '42501') equipeConferida = false; // talvez a equipe tenha mudado: confere na próxima vez
      if (Cloud.isMissingTable(err)) setStatus('no-table', err);
      else setStatus(navigator.onLine ? 'error' : 'offline', err);
    } finally {
      syncing = false;
      if (again) {
        const p = pullAgain;
        again = false;
        pullAgain = false;
        sync(p);
      }
    }
  }

  const Store = {
    uuid,
    clone,

    // Objetos de um tipo (cópias), sem os excluídos.
    all(tipo) {
      return Object.values(db.records)
        .filter((r) => r.tipo === tipo && !r.excluido)
        .map((r) => ({ ...clone(r.dados), id: r.id }));
    },

    get(id) {
      const r = db.records[id];
      return r && !r.excluido ? { ...clone(r.dados), id: r.id } : null;
    },

    tipoDe(id) {
      const r = db.records[id];
      return r && !r.excluido ? r.tipo : null;
    },

    // Cria ou atualiza. Retorna o objeto salvo (com id).
    put(tipo, obj) {
      const id = obj.id || uuid();
      const dados = { ...clone(obj), id };
      write({ id, tipo, dados, excluido: false });
      persist();
      emit({ type: 'change', source: 'local', ids: [id] });
      schedulePush();
      return dados;
    },

    putMany(tipo, objs) {
      const ids = objs.map((obj) => {
        const id = obj.id || uuid();
        write({ id, tipo, dados: { ...clone(obj), id }, excluido: false });
        return id;
      });
      persist();
      emit({ type: 'change', source: 'local', ids });
      schedulePush();
      return ids;
    },

    remove(id) {
      const r = db.records[id];
      if (!r) return;
      write({ id, tipo: r.tipo, dados: { id }, excluido: true });
      persist();
      emit({ type: 'change', source: 'local', ids: [id] });
      schedulePush();
    },

    // Para o backup: todos os registros ativos.
    exportAll() {
      return Object.values(db.records).filter((r) => !r.excluido).map((r) => ({ id: r.id, tipo: r.tipo, dados: clone(r.dados) }));
    },

    importAll(records) {
      const tipos = ['material', 'cliente', 'orcamento', 'anexo', 'config'];
      let n = 0;
      records.forEach((r) => {
        if (!r || !r.id || !tipos.includes(r.tipo) || !r.dados) return;
        write({ id: r.id, tipo: r.tipo, dados: { ...r.dados, id: r.id }, excluido: false });
        n++;
      });
      persist();
      emit({ type: 'change', source: 'remote', ids: records.map((r) => r && r.id) });
      schedulePush();
      return n;
    },

    // Chamado quando a pessoa entra ou sai da conta.
    setUser(u) {
      user = u;
      equipe = null;
      equipeJson = '';
      equipeConferida = false;
      if (!u) {
        clearTimeout(pushTimer);
        setStatus('local');
        emit({ type: 'team', equipe: null });
        return;
      }
      if (db.user && db.user !== u.id) {
        // Outra conta neste aparelho: não mistura os dados das duas.
        db = empty(u.id);
        emit({ type: 'change', source: 'remote', ids: [] });
      }
      db.user = u.id;
      persist();
      sync(true);
    },

    // Equipe da conta (null se ainda não conferiu ou se o banco não tem equipes).
    equipe: () => equipe,
    semEquipes: () => semEquipes,
    // Espaço dos dados: pasta dos arquivos na nuvem.
    espaco: () => db.owner || (user && user.id) || null,

    sync(pull = true) {
      return sync(pull);
    },

    // Envia já o que estiver pendente (ao sair da página, por exemplo).
    flush() {
      if (pendingCount() && user) sync(false);
    },

    status: () => status,
    lastError: () => lastError,
    pendingCount,
    hasUser: () => !!user,

    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  global.Store = Store;
})(window);
