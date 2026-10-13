/*
 * Configuração do Supabase (salvar na nuvem). Veja SUPABASE.md.
 *
 * É o mesmo projeto Supabase do Otimizador de Cortes: o login é o mesmo e
 * os dados ficam na tabela "orcamento_registros" (supabase/schema.sql).
 *
 * Deixe supabaseUrl/supabaseKey vazios para usar o site só com salvamento
 * no aparelho.
 *
 * A chave "publishable" é pública por natureza e pode ficar no GitHub: quem
 * protege os dados são as regras de segurança (RLS) do schema.sql. NUNCA
 * coloque aqui a chave "service_role" ou "secret".
 */
window.APP_CONFIG = {
  supabaseUrl: 'https://hvpafupdzqoochnlkfvp.supabase.co',
  supabaseKey: 'sb_publishable_gxZJWsTHWsg4tZkcIAnhCA_tQPPYppf',

  // Formas de login exibidas na tela "Entrar"
  loginGoogle: true,
  loginEmail: true,
};
