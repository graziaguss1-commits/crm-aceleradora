-- O banco da matriz foi montado por um script consolidado (regras no padrão
-- org_id = current_org_id()) e não pelas migrations deste repositório. Nessa
-- montagem ficaram de fora duas tabelas usadas pelo código e as regras de
-- acesso de profiles e user_roles.
--
-- Sem regra em profiles, o usuário logado não lê o próprio perfil, o app não
-- descobre a clínica (useOrg lê profile.org_id) e nenhuma tela lista ou salva.
-- Sem regra em user_roles, a tela de Equipe não lê nem troca papéis.

-- Checklist de boas-vindas (OnboardingChecklist, OnboardingModal)
create table if not exists public.onboarding_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  org_id uuid not null references public.organizations(id) on delete cascade,
  profile_configured boolean default false,
  pipeline_created boolean default false,
  contact_created boolean default false,
  deal_created boolean default false,
  member_invited boolean default false,
  email_connected boolean default false,
  demo_loaded boolean default false,
  completed boolean default false,
  dismissed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.onboarding_progress enable row level security;
drop policy if exists "Users manage own onboarding" on public.onboarding_progress;
create policy "Users manage own onboarding" on public.onboarding_progress
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tags em negócios (automação "adicionar tag" em process-automation)
create table if not exists public.deal_tags (
  deal_id uuid not null references public.deals(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (deal_id, tag_id)
);
alter table public.deal_tags enable row level security;
drop policy if exists "Org members can view deal tags" on public.deal_tags;
drop policy if exists "Org members can insert deal tags" on public.deal_tags;
drop policy if exists "Org members can delete deal tags" on public.deal_tags;
create policy "Org members can view deal tags" on public.deal_tags for select
  using (exists (select 1 from public.deals d where d.id = deal_id and public.user_belongs_to_org(auth.uid(), d.org_id)));
create policy "Org members can insert deal tags" on public.deal_tags for insert
  with check (exists (select 1 from public.deals d where d.id = deal_id and public.user_belongs_to_org(auth.uid(), d.org_id)));
create policy "Org members can delete deal tags" on public.deal_tags for delete
  using (exists (select 1 from public.deals d where d.id = deal_id and public.user_belongs_to_org(auth.uid(), d.org_id)));

-- profiles: cada um lê os perfis da própria clínica e edita o próprio;
-- admin/owner edita perfis da clínica (Equipe: remover membro zera org_id).
-- Ninguém consegue se mover para outra clínica.
drop policy if exists "Members read org profiles" on public.profiles;
drop policy if exists "Users insert own profile" on public.profiles;
drop policy if exists "Users update own profile" on public.profiles;
drop policy if exists "Org admins update org profiles" on public.profiles;
create policy "Members read org profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or org_id = current_org_id());
create policy "Users insert own profile" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "Users update own profile" on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (org_id is null or org_id is not distinct from current_org_id()));
create policy "Org admins update org profiles" on public.profiles for update to authenticated
  using (org_id = current_org_id() and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'owner'::app_role)))
  with check (org_id is null or org_id = current_org_id());

-- user_roles: membros leem os papéis da clínica; admin/owner gerencia.
drop policy if exists "Members read org roles" on public.user_roles;
drop policy if exists "Org admins manage roles" on public.user_roles;
create policy "Members read org roles" on public.user_roles for select to authenticated
  using (org_id = current_org_id());
create policy "Org admins manage roles" on public.user_roles for all to authenticated
  using (org_id = current_org_id() and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'owner'::app_role)))
  with check (org_id = current_org_id() and (has_role(auth.uid(), 'admin'::app_role) or has_role(auth.uid(), 'owner'::app_role)));
