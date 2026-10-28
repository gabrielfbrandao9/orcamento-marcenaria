/*
 * Nuvem (Supabase): login e leitura/gravação da tabela "orcamento_registros".
 * Cada registro é um material, cliente, orçamento, anexo ou a configuração,
 * guardado como JSON, e pertence a um espaço: a equipe ou, sem equipe, a
 * própria conta. Os arquivos dos anexos ficam no Supabase Storage.
 * Se o Supabase não estiver configurado, Cloud.enabled = false e o site
 * funciona só com o armazenamento do aparelho.
 */
(function (global) {
  'use strict';

  const cfg = global.APP_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseKey && global.supabase && global.supabase.createClient);
  const client = enabled ? global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  const TABLE = 'orcamento_registros';
  const BUCKET = 'orcamento-anexos';
  const COLS = 'id, tipo, dados, excluido, alterado_em';
  const PAGE = 1000;

  const redirectTo = () => global.location.origin + global.location.pathname;

  function check(res) {
    if (res.error) throw res.error;
    return res.data;
  }

  const Cloud = {
    enabled,
    loginGoogle: enabled && cfg.loginGoogle !== false,
    loginEmail: enabled && cfg.loginEmail !== false,

    onAuthChange(cb) {
      if (!client) return;
      client.auth.onAuthStateChange((event, session) => cb(session ? session.user : null, event));
    },

    // Formas de login ativadas no Supabase ({ google: true, email: true, ... }) ou null se não der para saber.
    async providers() {
      if (!enabled) return null;
      if (!this._providers) {
        this._providers = fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/auth/v1/settings', { headers: { apikey: cfg.supabaseKey } })
          .then((r) => r.json())
          .then((s) => s.external || null)
          .catch(() => null);
      }
      return this._providers;
    },

    async signInWithGoogle() {
      check(await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } }));
    },

    async signInWithEmail(email) {
      check(await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } }));
    },

    async signOut() {
      check(await client.auth.signOut());
    },

    // Todos os registros do espaço (equipe), inclusive os excluídos (para outros aparelhos saberem da exclusão).
    async pullAll() {
      const all = [];
      for (let from = 0; ; from += PAGE) {
        const rows = check(await client.from(TABLE).select(COLS).order('id').range(from, from + PAGE - 1));
        all.push(...rows);
        if (rows.length < PAGE) return all;
      }
    },

    // equipeId: espaço onde gravar (null se o banco ainda não tem equipes).
    async push(records, equipeId) {
      for (let i = 0; i < records.length; i += 200) {
        const rows = records.slice(i, i + 200).map((r) => {
          const row = { id: r.id, tipo: r.tipo, dados: r.dados, excluido: !!r.excluido, alterado_em: r.alterado_em };
          if (equipeId) row.equipe_id = equipeId;
          return row;
        });
        check(await client.from(TABLE).upsert(rows));
      }
    },

    // ---------- Equipe ----------

    // { equipe_id, nome, papel, membros, convites_enviados, convites_recebidos }
    async equipe() {
      return check(await client.rpc('equipe_estado'));
    },

    async convidar(email, nome) {
      check(await client.rpc('equipe_convidar', { p_email: email, p_nome: nome }));
    },

    // Cancela (o dono) ou recusa (quem foi convidado).
    async apagarConvite(id) {
      check(await client.rpc('equipe_apagar_convite', { p_id: id }));
    },

    async aceitarConvite(id, levarDados) {
      check(await client.rpc('equipe_aceitar_convite', { p_id: id, p_levar: !!levarDados }));
    },

    async removerMembro(userId) {
      check(await client.rpc('equipe_remover_membro', { p_user: userId }));
    },

    async sairDaEquipe() {
      check(await client.rpc('equipe_sair'));
    },

    // Marca que a pessoa abriu o app (o banco guarda no máximo a cada 5 minutos).
    async registrarAcesso() {
      check(await client.rpc('equipe_registrar_acesso'));
    },

    // ---------- Projetos do Otimizador de Cortes (tabela "projects") ----------

    async listCutProjects() {
      return check(await client.from('projects').select('id, name, updated_at').order('updated_at', { ascending: false }));
    },

    async loadCutProject(id) {
      return check(await client.from('projects').select('id, name, data').eq('id', id).single());
    },

    // ---------- Arquivos (Supabase Storage) ----------

    async uploadFile(path, blob, contentType) {
      check(await client.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true }));
    },

    async downloadFile(path) {
      return check(await client.storage.from(BUCKET).download(path));
    },

    async removeFiles(paths) {
      check(await client.storage.from(BUCKET).remove(paths));
    },

    // O bucket de arquivos ainda não foi criado (falta rodar o schema.sql atualizado).
    isMissingBucket(err) {
      return !!err && /bucket not found/i.test(err.message || '');
    },

    // As funções da equipe ainda não existem no Supabase (falta rodar o schema.sql atualizado).
    isMissingFunction(err) {
      return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));
    },

    // A tabela ainda não foi criada no Supabase (falta rodar o schema.sql).
    isMissingTable(err) {
      return !!err && (err.code === '42P01' || err.code === 'PGRST205' || /could not find the table|does not exist/i.test(err.message || ''));
    },
  };

  global.Cloud = Cloud;
})(window);
