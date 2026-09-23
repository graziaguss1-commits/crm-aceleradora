-- Cadastro de anuncios, gerenciado em Configuracoes -> Anuncios.
-- O campo "Anuncio / criativo" do lead deixa de ser texto livre e passa a
-- escolher desta lista, o que evita variacoes de digitacao quebrando o
-- agrupamento por anuncio nos dashboards.
-- Aplicado no Supabase via MCP em 2026-08-25; espelho para historico.

create table if not exists public.anuncios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  canal text null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, nome)
);

create index if not exists anuncios_org_ativo_idx on public.anuncios (org_id, ativo);

alter table public.anuncios enable row level security;

drop policy if exists "Org members access anuncios" on public.anuncios;
create policy "Org members access anuncios" on public.anuncios
  for all
  using (org_id = current_org_id())
  with check (org_id = current_org_id());
