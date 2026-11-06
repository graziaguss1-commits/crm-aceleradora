-- As telas de Atividades e Tarefas vinculam a atividade a um negócio do pipeline
-- (é por ele que o lead entra, já que activities.contact_id aponta para patients)
-- e a um responsável. O schema de saúde não tinha essas colunas, então todo
-- salvamento falhava. Colunas opcionais, nada é apagado.
alter table public.activities
  add column if not exists deal_id uuid references public.deals(id) on delete set null,
  add column if not exists user_id uuid references public.profiles(id) on delete set null;

create index if not exists idx_activities_deal_id on public.activities(deal_id);
create index if not exists idx_activities_user_id on public.activities(user_id);

comment on column public.activities.deal_id is 'Negócio (lead no pipeline) ao qual a atividade se refere';
comment on column public.activities.user_id is 'Responsável pela atividade';
