-- Relatório quinzenal da secretária (Aceleradora SISA), calculado pelo CRM.
--
-- Antes a secretária copiava cada número do CRM para uma planilha. Agora a
-- função calcula tudo para um período; a tela chama duas vezes (quinzena
-- atual e anterior) e mostra a variação.
--
-- Definições (sempre dentro de [p_inicio, p_fim)):
--   leads_recebidos   negócios do pipeline padrão criados no período
--   em_conversa       negócios que entraram em "Em conversa" no período
--   qualificados      negócios que entraram em "Qualificado" no período
--   agendados         negócios que entraram em "Ganho" no período
--   compareceram      consultas da Agenda marcadas como attended
--   faltas            consultas da Agenda marcadas como no_show
--   faltas_reagendadas  faltas cujo paciente ganhou nova consulta (não
--                     cancelada) criada depois da falta, dentro do período
--   resgatados        negócios que chegaram a Ganho depois de ter follow-up
--   perdas_total      negócios que entraram em "Perdido" no período
--   perdas_por_motivo motivo -> nº de negócios perdidos com esse motivo
--                     (um lead pode ter mais de um motivo)
--   origem            canal dos leads recebidos; sem_origem = sem canal e
--                     sem indicação (é o alerta da planilha)
--
-- security invoker: roda com as regras de acesso de quem chama, então cada
-- clínica só enxerga os próprios números (current_org_id()).
create or replace function public.relatorio_quinzenal(p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with org as (
    select current_org_id() as id
  ),
  pipe as (
    select p.id from public.pipelines p, org
     where p.org_id = org.id and p.is_default
     order by p.created_at
     limit 1
  ),
  etapas as (
    select s.id, s.name from public.pipeline_stages s where s.pipeline_id in (select id from pipe)
  ),
  hist as (
    select h.deal_id, h.created_at, e.name as etapa
      from public.deal_stage_history h
      join etapas e on e.id = h.to_stage_id
     where h.created_at >= p_inicio and h.created_at < p_fim
  ),
  recebidos as (
    select d.id, c.canal, c.indicado_por_contact_id
      from public.deals d
      left join public.contacts c on c.id = d.contact_id
     where d.pipeline_id in (select id from pipe)
       and d.created_at >= p_inicio and d.created_at < p_fim
  ),
  ganhos as (
    select deal_id, min(created_at) as quando from hist where etapa = 'Ganho' group by deal_id
  ),
  perdidos as (
    select distinct deal_id from hist where etapa = 'Perdido'
  ),
  consultas as (
    select a.id, a.contact_id, a.due_date, a.appointment_status
      from public.activities a, org
     where a.org_id = org.id
       and a.appointment_status in ('attended', 'no_show')
       and a.due_date >= p_inicio and a.due_date < p_fim
  )
  select jsonb_build_object(
    'leads_recebidos', (select count(*) from recebidos),
    'em_conversa',     (select count(distinct deal_id) from hist where etapa = 'Em conversa'),
    'qualificados',    (select count(distinct deal_id) from hist where etapa = 'Qualificado'),
    'agendados',       (select count(*) from ganhos),
    'compareceram',    (select count(*) from consultas where appointment_status = 'attended'),
    'faltas',          (select count(*) from consultas where appointment_status = 'no_show'),
    'faltas_reagendadas', (
      select count(*) from consultas f
       where f.appointment_status = 'no_show'
         and f.contact_id is not null
         and exists (
           select 1 from public.activities n
            where n.org_id = (select id from org)
              and n.contact_id = f.contact_id
              and n.id <> f.id
              and n.appointment_status is not null
              and n.appointment_status <> 'cancelled'
              and n.created_at > f.due_date
              and n.created_at < p_fim
         )
    ),
    'resgatados', (
      select count(*) from ganhos g
       where exists (
         select 1 from public.follow_ups fu where fu.deal_id = g.deal_id and fu.created_at < g.quando
       )
    ),
    'perdas_total', (select count(*) from perdidos),
    'perdas_por_motivo', coalesce((
      select jsonb_object_agg(m.label, m.n)
        from (
          select o.label, count(distinct x.deal_id) as n
            from public.deal_objecoes x
            join public.objecoes o on o.id = x.objecao_id
           where x.deal_id in (select deal_id from perdidos)
           group by o.label
        ) m
    ), '{}'::jsonb),
    'origem', jsonb_build_object(
      'anuncios',   (select count(*) from recebidos where canal in ('Meta Ads', 'Google')),
      'instagram',  (select count(*) from recebidos where canal = 'Instagram Orgânico'),
      'indicacao',  (select count(*) from recebidos where canal = 'Indicação' or (canal is null and indicado_por_contact_id is not null)),
      'outros',     (select count(*) from recebidos where canal is not null and canal not in ('Meta Ads', 'Google', 'Instagram Orgânico', 'Indicação')),
      'sem_origem', (select count(*) from recebidos where canal is null and indicado_por_contact_id is null)
    )
  );
$$;

grant execute on function public.relatorio_quinzenal(timestamptz, timestamptz) to authenticated;

-- Seção 6 da planilha (observações) e responsável: o que a secretária escreve.
create table if not exists public.relatorios_quinzenais (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  inicio date not null,
  fim date not null,
  responsavel text,
  o_que_funcionou text,
  onde_perdemos text,
  acao_proximos text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, inicio)
);
alter table public.relatorios_quinzenais enable row level security;
drop policy if exists "Org members access relatorios_quinzenais" on public.relatorios_quinzenais;
create policy "Org members access relatorios_quinzenais" on public.relatorios_quinzenais
  for all to authenticated
  using (org_id = current_org_id())
  with check (org_id = current_org_id());

-- Motivos de perda da planilha que ainda não estavam na lista padrão
insert into public.objecoes (org_id, label)
select o.id, x.label
  from public.organizations o
 cross join (values ('Sem perfil para o tratamento'), ('Foi para outra clínica')) as x(label)
 where not exists (select 1 from public.objecoes j where j.org_id = o.id and j.label = x.label);
