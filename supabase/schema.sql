-- Orçamentos - Marcenaria Dier: banco de dados no Supabase
-- Usa o MESMO projeto do Otimizador de Cortes (não mexe na tabela "projects").
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run

create table if not exists public.orcamento_registros (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
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

create index if not exists orcamento_registros_user_idx on public.orcamento_registros (user_id, tipo);

-- Segurança: cada pessoa só enxerga e altera os próprios registros
alter table public.orcamento_registros enable row level security;

drop policy if exists "Ver os próprios registros" on public.orcamento_registros;
create policy "Ver os próprios registros" on public.orcamento_registros
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Criar os próprios registros" on public.orcamento_registros;
create policy "Criar os próprios registros" on public.orcamento_registros
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Alterar os próprios registros" on public.orcamento_registros;
create policy "Alterar os próprios registros" on public.orcamento_registros
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Excluir os próprios registros" on public.orcamento_registros;
create policy "Excluir os próprios registros" on public.orcamento_registros
  for delete to authenticated
  using ((select auth.uid()) = user_id);

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
-- Arquivos dos orçamentos (fotos, PDF do plano de corte...) no Supabase Storage
-- Cada arquivo fica em: <id da pessoa>/<id do orçamento>/<id do arquivo>.<extensão>
-- O bucket é privado e cada pessoa só acessa a própria pasta. Limite: 20 MB por arquivo.

insert into storage.buckets (id, name, public, file_size_limit)
values ('orcamento-anexos', 'orcamento-anexos', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "Anexos: ver os próprios" on storage.objects;
create policy "Anexos: ver os próprios" on storage.objects
  for select to authenticated
  using (bucket_id = 'orcamento-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Anexos: enviar os próprios" on storage.objects;
create policy "Anexos: enviar os próprios" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'orcamento-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Anexos: alterar os próprios" on storage.objects;
create policy "Anexos: alterar os próprios" on storage.objects
  for update to authenticated
  using (bucket_id = 'orcamento-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'orcamento-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Anexos: apagar os próprios" on storage.objects;
create policy "Anexos: apagar os próprios" on storage.objects
  for delete to authenticated
  using (bucket_id = 'orcamento-anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
