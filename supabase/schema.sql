-- Orçamentos - Marcenaria Dier: banco de dados no Supabase
-- Usa o MESMO projeto do Otimizador de Cortes (não mexe na tabela "projects").
-- Cole este arquivo inteiro em: Supabase > SQL Editor > New query > Run

create table if not exists public.orcamento_registros (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- material, cliente, orcamento ou config
  tipo text not null check (tipo in ('material', 'cliente', 'orcamento', 'config')),
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
