-- Bloqueios de horario na agenda: periodos sem paciente (reuniao, almoco, folga).
-- Aplicado no Supabase via MCP em 2026-08-25; este arquivo e o espelho para historico.

create table if not exists public.agenda_bloqueios (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  professional_id uuid null,
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  observacao text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint agenda_bloqueios_periodo_valido check (fim > inicio)
);

create index if not exists agenda_bloqueios_org_inicio_idx
  on public.agenda_bloqueios (org_id, inicio);

alter table public.agenda_bloqueios enable row level security;

drop policy if exists "Org members access agenda_bloqueios" on public.agenda_bloqueios;
create policy "Org members access agenda_bloqueios" on public.agenda_bloqueios
  for all
  using (org_id = current_org_id())
  with check (org_id = current_org_id());
