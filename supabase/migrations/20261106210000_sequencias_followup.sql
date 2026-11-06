-- Sequências de follow-up.
--
-- A clínica cria modelos (ex.: "Menopausa": 3 dias -> mensagem A, 7 dias ->
-- mensagem B, 20 dias -> mensagem C). Na ficha do lead, aplicar a sequência
-- agenda todos os follow-ups de uma vez, cada um com a mensagem pronta
-- ({nome} vira o primeiro nome do lead).

create table if not exists public.sequencias_followup (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  nome text not null,
  descricao text,
  ativa boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sequencia_passos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sequencia_id uuid not null references public.sequencias_followup(id) on delete cascade,
  ordem int not null,
  dias int not null check (dias >= 0 and dias <= 365),
  canal text not null default 'WhatsApp'
    check (canal = any (array['WhatsApp', 'Ligação', 'E-mail', 'Presencial'])),
  mensagem text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_sequencia_passos_seq on public.sequencia_passos(sequencia_id, ordem);

alter table public.sequencias_followup enable row level security;
alter table public.sequencia_passos enable row level security;
drop policy if exists "Org members access sequencias_followup" on public.sequencias_followup;
create policy "Org members access sequencias_followup" on public.sequencias_followup
  for all to authenticated using (org_id = current_org_id()) with check (org_id = current_org_id());
drop policy if exists "Org members access sequencia_passos" on public.sequencia_passos;
create policy "Org members access sequencia_passos" on public.sequencia_passos
  for all to authenticated using (org_id = current_org_id()) with check (org_id = current_org_id());

-- Follow-up passa a guardar a mensagem pronta e de qual sequência/passo veio
alter table public.follow_ups
  add column if not exists mensagem text,
  add column if not exists sequencia_id uuid references public.sequencias_followup(id) on delete set null,
  add column if not exists passo_ordem int,
  add column if not exists passo_total int;
create index if not exists idx_follow_ups_data on public.follow_ups(org_id, status, data_agendada);

-- Agenda a sequência inteira para um lead (negócio).
--   p_inicio: dia de referência (normalmente hoje); o passo "3 dias" cai em
--             p_inicio + 3, no horário p_hora, no fuso da clínica.
--   Reaplicar a mesma sequência no mesmo lead cancela os pendentes dela antes,
--   para não duplicar.
-- security invoker: grava com as regras de acesso de quem chama.
create or replace function public.aplicar_sequencia_followup(
  p_deal uuid,
  p_sequencia uuid,
  p_inicio date default null,
  p_hora time default '09:00'
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_deal public.deals%rowtype;
  v_nome text;
  v_tz text;
  v_total int;
  v_inicio date;
  v_criados int;
begin
  if v_org is null then
    raise exception 'Sem acesso';
  end if;

  select * into v_deal from public.deals where id = p_deal and org_id = v_org;
  if not found then
    raise exception 'Lead não encontrado';
  end if;

  if not exists (select 1 from public.sequencias_followup where id = p_sequencia and org_id = v_org and ativa) then
    raise exception 'Sequência não encontrada ou inativa';
  end if;

  select count(*) into v_total from public.sequencia_passos where sequencia_id = p_sequencia;
  if v_total = 0 then
    raise exception 'A sequência não tem passos';
  end if;

  select coalesce(nullif(trim(c.first_name), ''), split_part(v_deal.title, ' ', 1), '')
    into v_nome
    from public.contacts c where c.id = v_deal.contact_id;
  v_nome := coalesce(v_nome, split_part(v_deal.title, ' ', 1), '');

  select coalesce(o.settings->>'timezone', 'America/Sao_Paulo') into v_tz
    from public.organizations o where o.id = v_org;
  v_inicio := coalesce(p_inicio, (now() at time zone v_tz)::date);

  update public.follow_ups
     set status = 'cancelado'
   where deal_id = p_deal and sequencia_id = p_sequencia and status = 'pendente';

  insert into public.follow_ups (
    org_id, deal_id, contact_id, created_by, data_agendada, canal,
    mensagem, status, sequencia_id, passo_ordem, passo_total
  )
  select v_org, p_deal, v_deal.contact_id, auth.uid(),
         ((v_inicio + p.dias) + p_hora) at time zone v_tz,
         p.canal,
         regexp_replace(p.mensagem, '\{\{?\s*(nome|primeiro_nome)\s*\}?\}', v_nome, 'gi'),
         'pendente', p_sequencia,
         row_number() over (order by p.ordem, p.dias),
         v_total
    from public.sequencia_passos p
   where p.sequencia_id = p_sequencia;

  get diagnostics v_criados = row_count;
  return v_criados;
end;
$$;
grant execute on function public.aplicar_sequencia_followup(uuid, uuid, date, time) to authenticated;

-- Lead que vira Ganho ou Perdido para de receber os contatos automáticos da
-- sequência: os pendentes dela são cancelados (follow-ups avulsos ficam).
create or replace function public.encerra_sequencia_no_fechamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa text;
begin
  if new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select name into v_etapa from public.pipeline_stages where id = new.stage_id;
  if v_etapa in ('Ganho', 'Perdido') then
    update public.follow_ups
       set status = 'cancelado'
     where deal_id = new.id
       and org_id = new.org_id
       and sequencia_id is not null
       and status = 'pendente';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_deals_encerra_sequencia on public.deals;
create trigger trg_deals_encerra_sequencia
  after update of stage_id on public.deals
  for each row execute function public.encerra_sequencia_no_fechamento();
