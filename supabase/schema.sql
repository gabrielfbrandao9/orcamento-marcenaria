-- Orçamentos - Marcenaria Dier: banco de dados no Supabase
-- Usa o MESMO projeto do Otimizador de Cortes (não mexe na tabela "projects").
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run
-- Pode rodar quantas vezes precisar: não apaga nada.

-- ---------------------------------------------------------------------------
-- Equipes: mais de uma conta vendo e alterando os mesmos dados.
--
-- Os dados ficam num "espaço". Quem não está em equipe usa o próprio espaço,
-- cujo id é o id da conta. Ao convidar a primeira pessoa, esse espaço vira a
-- equipe (a equipe tem o mesmo id da conta do dono), então nada precisa mudar
-- de lugar. Cada conta está em uma equipe só, e todos da equipe podem tudo;
-- só o dono convida e remove pessoas.
-- As tabelas abaixo não têm acesso direto: só as funções deste arquivo mexem nelas.

create table if not exists public.equipes (
  id uuid primary key,  -- igual ao id da conta do dono
  nome text not null default '',
  dono uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.equipe_membros (
  user_id uuid primary key references auth.users (id) on delete cascade,  -- uma equipe por conta
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  email text not null default '',
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default now()
);
create index if not exists equipe_membros_equipe_idx on public.equipe_membros (equipe_id);

create table if not exists public.equipe_convites (
  id uuid primary key default gen_random_uuid(),
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  email text not null check (email = lower(email)),
  convidado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (equipe_id, email)
);
create index if not exists equipe_convites_email_idx on public.equipe_convites (email);

alter table public.equipes enable row level security;
alter table public.equipe_membros enable row level security;
alter table public.equipe_convites enable row level security;
revoke all on public.equipes, public.equipe_membros, public.equipe_convites from anon, authenticated;

-- Espaço de dados de quem está usando: a equipe ou, sem equipe, a própria conta.
create or replace function public.minha_equipe()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.equipe_id from public.equipe_membros m where m.user_id = auth.uid()), auth.uid());
$$;

-- E-mail confirmado de quem está usando (em minúsculas), ou null.
create or replace function public.meu_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

-- ---------------------------------------------------------------------------
-- Registros: materiais, clientes, orçamentos, anexos e configuração.

create table if not exists public.orcamento_registros (
  id uuid primary key,
  -- quem criou o registro
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  -- espaço (equipe ou conta) a que o registro pertence
  equipe_id uuid not null default public.minha_equipe(),
  -- material, cliente, orcamento, anexo (arquivo de um orçamento) ou config
  tipo text not null check (tipo in ('material', 'cliente', 'orcamento', 'anexo', 'config')),
  dados jsonb not null,
  -- exclusões são marcadas, não apagadas, para os outros aparelhos ficarem sabendo
  excluido boolean not null default false,
  -- momento da alteração no aparelho (milissegundos); a alteração mais recente vence
  alterado_em bigint not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- evita abusos: um registro não pode passar de ~500 KB
  constraint orcamento_registros_tamanho check (pg_column_size(dados) < 500000)
);

-- Para quem já tinha criado a tabela antes dos anexos: aceita o tipo "anexo"
alter table public.orcamento_registros drop constraint if exists orcamento_registros_tipo_check;
alter table public.orcamento_registros add constraint orcamento_registros_tipo_check
  check (tipo in ('material', 'cliente', 'orcamento', 'anexo', 'config'));

-- Para quem já tinha criado a tabela antes das equipes: cada registro fica no espaço de quem o criou
alter table public.orcamento_registros add column if not exists equipe_id uuid;
update public.orcamento_registros set equipe_id = user_id where equipe_id is null;
alter table public.orcamento_registros alter column equipe_id set default public.minha_equipe();
alter table public.orcamento_registros alter column equipe_id set not null;

-- Se a conta de quem criou um registro for apagada, o registro continua na equipe
alter table public.orcamento_registros alter column user_id drop not null;
alter table public.orcamento_registros drop constraint if exists orcamento_registros_user_id_fkey;
alter table public.orcamento_registros add constraint orcamento_registros_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

create index if not exists orcamento_registros_user_idx on public.orcamento_registros (user_id, tipo);
create index if not exists orcamento_registros_equipe_idx on public.orcamento_registros (equipe_id, tipo);

-- Segurança: cada pessoa só enxerga e altera os registros do próprio espaço (a equipe)
alter table public.orcamento_registros enable row level security;

drop policy if exists "Ver os próprios registros" on public.orcamento_registros;
drop policy if exists "Criar os próprios registros" on public.orcamento_registros;
drop policy if exists "Alterar os próprios registros" on public.orcamento_registros;
drop policy if exists "Excluir os próprios registros" on public.orcamento_registros;

drop policy if exists "Ver os registros da equipe" on public.orcamento_registros;
create policy "Ver os registros da equipe" on public.orcamento_registros
  for select to authenticated
  using (equipe_id = (select public.minha_equipe()));

drop policy if exists "Criar registros na equipe" on public.orcamento_registros;
create policy "Criar registros na equipe" on public.orcamento_registros
  for insert to authenticated
  with check (equipe_id = (select public.minha_equipe()));

drop policy if exists "Alterar os registros da equipe" on public.orcamento_registros;
create policy "Alterar os registros da equipe" on public.orcamento_registros
  for update to authenticated
  using (equipe_id = (select public.minha_equipe()))
  with check (equipe_id = (select public.minha_equipe()));

drop policy if exists "Excluir os registros da equipe" on public.orcamento_registros;
create policy "Excluir os registros da equipe" on public.orcamento_registros
  for delete to authenticated
  using (equipe_id = (select public.minha_equipe()));

grant select, insert, update, delete on public.orcamento_registros to authenticated;

-- Atualiza atualizado_em automaticamente
create or replace function public.orcamento_set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists orcamento_registros_atualizado_em on public.orcamento_registros;
create trigger orcamento_registros_atualizado_em
  before update on public.orcamento_registros
  for each row execute function public.orcamento_set_atualizado_em();

-- ---------------------------------------------------------------------------
-- Funções da equipe (chamadas pelo app)

-- Tudo o que a tela "Equipe" precisa: espaço atual, pessoas e convites.
create or replace function public.equipe_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  eq uuid := public.minha_equipe();
begin
  if uid is null then
    raise exception 'Entre na conta.';
  end if;
  return jsonb_build_object(
    'equipe_id', eq,
    'nome', (select e.nome from public.equipes e where e.id = eq),
    'papel', (select m.papel from public.equipe_membros m where m.user_id = uid),
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', m.email, 'papel', m.papel)
                       order by m.papel, m.email)
      from public.equipe_membros m where m.equipe_id = eq), '[]'::jsonb),
    'convites_enviados', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'email', c.email) order by c.criado_em)
      from public.equipe_convites c where c.equipe_id = eq), '[]'::jsonb),
    'convites_recebidos', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'equipe', e.nome, 'dono', d.email) order by c.criado_em)
      from public.equipe_convites c
      join public.equipes e on e.id = c.equipe_id
      left join public.equipe_membros d on d.equipe_id = e.id and d.papel = 'dono'
      where c.email = public.meu_email() and c.equipe_id <> eq), '[]'::jsonb)
  );
end;
$$;

-- Convida alguém pelo e-mail. Na primeira vez, cria a equipe com os dados de quem convida.
create or replace function public.equipe_convidar(p_email text, p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  em text := lower(trim(coalesce(p_email, '')));
  meu_papel text;
begin
  if uid is null then
    raise exception 'Entre na conta.';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if public.meu_email() is null then
    raise exception 'Confirme o seu e-mail antes de convidar pessoas.';
  end if;
  if em = public.meu_email() then
    raise exception 'Esse é o seu próprio e-mail.';
  end if;
  select m.papel into meu_papel from public.equipe_membros m where m.user_id = uid;
  if meu_papel = 'membro' then
    raise exception 'Só o dono da equipe pode convidar pessoas.';
  end if;
  if meu_papel is null then
    insert into public.equipes (id, nome, dono)
    values (uid, coalesce(nullif(trim(p_nome), ''), 'Minha equipe'), uid)
    on conflict (id) do update set nome = excluded.nome, dono = excluded.dono;
    insert into public.equipe_membros (user_id, equipe_id, email, papel)
    values (uid, uid, public.meu_email(), 'dono');
  end if;
  if exists (select 1 from public.equipe_membros m where m.equipe_id = uid and m.email = em) then
    raise exception 'Essa pessoa já está na equipe.';
  end if;
  if (select count(*) from public.equipe_convites c where c.equipe_id = uid) >= 20 then
    raise exception 'Há convites demais esperando resposta. Cancele alguns antes.';
  end if;
  insert into public.equipe_convites (equipe_id, email, convidado_por)
  values (uid, em, uid)
  on conflict (equipe_id, email) do nothing;
end;
$$;

-- Cancela um convite (o dono) ou recusa (a pessoa convidada).
create or replace function public.equipe_apagar_convite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.equipe_convites c
  where c.id = p_id
    and (c.equipe_id = auth.uid() or c.email = public.meu_email());
end;
$$;

-- Aceita um convite. Com p_levar, os orçamentos, clientes, materiais e arquivos
-- do espaço próprio vão para a equipe (os ajustes não: valem os da equipe).
create or replace function public.equipe_aceitar_convite(p_id uuid, p_levar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  conv public.equipe_convites;
  meu_papel text;
begin
  if uid is null then
    raise exception 'Entre na conta.';
  end if;
  select * into conv from public.equipe_convites c where c.id = p_id and c.email = public.meu_email();
  if not found then
    raise exception 'Convite não encontrado. Ele pode ter sido cancelado.';
  end if;
  select m.papel into meu_papel from public.equipe_membros m where m.user_id = uid;
  if meu_papel = 'dono' then
    if exists (select 1 from public.equipe_membros m where m.equipe_id = uid and m.user_id <> uid) then
      raise exception 'Você é dono de uma equipe com outras pessoas. Remova as pessoas antes de entrar em outra equipe.';
    end if;
    delete from public.equipes where id = uid; -- desfaz a equipe vazia (e os convites dela)
  elsif meu_papel = 'membro' then
    delete from public.equipe_membros where user_id = uid;
  end if;
  if p_levar then
    update public.orcamento_registros
    set equipe_id = conv.equipe_id
    where equipe_id = uid and tipo <> 'config' and not excluido;
  end if;
  insert into public.equipe_membros (user_id, equipe_id, email, papel)
  values (uid, conv.equipe_id, public.meu_email(), 'membro');
  delete from public.equipe_convites c where c.equipe_id = conv.equipe_id and c.email = conv.email;
end;
$$;

-- O dono tira alguém da equipe. A pessoa volta para o próprio espaço; o que ela
-- fez na equipe continua na equipe.
create or replace function public.equipe_remover_membro(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user = auth.uid() then
    raise exception 'Você não pode remover a si mesmo.';
  end if;
  if not exists (select 1 from public.equipe_membros m where m.user_id = auth.uid() and m.papel = 'dono') then
    raise exception 'Só o dono da equipe pode remover pessoas.';
  end if;
  delete from public.equipe_membros m where m.user_id = p_user and m.equipe_id = auth.uid();
end;
$$;

-- Sair da equipe. O dono só sai se não houver mais ninguém (a equipe deixa de existir,
-- e os dados continuam com ele, no próprio espaço).
create or replace function public.equipe_sair()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  meu_papel text;
begin
  select m.papel into meu_papel from public.equipe_membros m where m.user_id = uid;
  if meu_papel = 'dono' then
    if exists (select 1 from public.equipe_membros m where m.equipe_id = uid and m.user_id <> uid) then
      raise exception 'Você é o dono: remova as outras pessoas antes de desfazer a equipe.';
    end if;
    delete from public.equipes where id = uid;
  elsif meu_papel = 'membro' then
    delete from public.equipe_membros where user_id = uid;
  end if;
end;
$$;

revoke execute on function public.minha_equipe(), public.meu_email(), public.equipe_estado(),
  public.equipe_convidar(text, text), public.equipe_apagar_convite(uuid),
  public.equipe_aceitar_convite(uuid, boolean), public.equipe_remover_membro(uuid), public.equipe_sair()
  from public, anon;
grant execute on function public.minha_equipe(), public.meu_email(), public.equipe_estado(),
  public.equipe_convidar(text, text), public.equipe_apagar_convite(uuid),
  public.equipe_aceitar_convite(uuid, boolean), public.equipe_remover_membro(uuid), public.equipe_sair()
  to authenticated;

-- ---------------------------------------------------------------------------
-- Arquivos dos orçamentos (fotos, PDF do plano de corte...) no Supabase Storage
-- Cada arquivo fica em: <id da equipe>/<id do orçamento>/<id do arquivo>.<extensão>
-- O bucket é privado. Cada pessoa acessa a pasta da equipe e a pasta da própria
-- conta (onde estão os arquivos de antes de entrar na equipe, até o app levá-los
-- para a pasta da equipe). Limite: 20 MB por arquivo.

insert into storage.buckets (id, name, public, file_size_limit)
values ('orcamento-anexos', 'orcamento-anexos', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "Anexos: ver os próprios" on storage.objects;
create policy "Anexos: ver os próprios" on storage.objects
  for select to authenticated
  using (bucket_id = 'orcamento-anexos'
    and (storage.foldername(name))[1] in ((select public.minha_equipe())::text, (select auth.uid())::text));

drop policy if exists "Anexos: enviar os próprios" on storage.objects;
create policy "Anexos: enviar os próprios" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'orcamento-anexos'
    and (storage.foldername(name))[1] in ((select public.minha_equipe())::text, (select auth.uid())::text));

drop policy if exists "Anexos: alterar os próprios" on storage.objects;
create policy "Anexos: alterar os próprios" on storage.objects
  for update to authenticated
  using (bucket_id = 'orcamento-anexos'
    and (storage.foldername(name))[1] in ((select public.minha_equipe())::text, (select auth.uid())::text))
  with check (bucket_id = 'orcamento-anexos'
    and (storage.foldername(name))[1] in ((select public.minha_equipe())::text, (select auth.uid())::text));

drop policy if exists "Anexos: apagar os próprios" on storage.objects;
create policy "Anexos: apagar os próprios" on storage.objects
  for delete to authenticated
  using (bucket_id = 'orcamento-anexos'
    and (storage.foldername(name))[1] in ((select public.minha_equipe())::text, (select auth.uid())::text));
