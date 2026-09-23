-- activities.professional_id apontava para profiles (usuarios com login) em vez
-- de professionals (medicos cadastrados na tela Medicos). Isso impedia salvar
-- um medico numa consulta: a lista da tela de agendamento vinha vazia e, se
-- viesse preenchida, o insert falharia na foreign key.
-- Aplicado no Supabase via MCP em 2026-08-25; espelho para historico.

update public.activities
   set professional_id = null
 where professional_id is not null
   and not exists (
     select 1 from public.professionals pr where pr.id = activities.professional_id
   );

alter table public.activities drop constraint activities_professional_id_fkey;

alter table public.activities
  add constraint activities_professional_id_fkey
  foreign key (professional_id) references public.professionals(id) on delete set null;
