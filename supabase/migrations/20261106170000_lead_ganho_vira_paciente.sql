-- Lead ganho vira paciente.
--
-- Quando um negócio entra na etapa "Ganho" (arrastando no Pipeline, pela ficha
-- do lead, cadastrado já como ganho ou por automação), o contato do lead ganha
-- um cadastro em patients. Feito no banco para valer por qualquer caminho.
--
-- Sem duplicar: se o contato já foi convertido (contacts.metadata.patient_id)
-- ou se já existe paciente da clínica com o mesmo telefone ou e-mail, esse
-- cadastro é reaproveitado e só o vínculo é gravado.
--
-- security definer porque também roda em mudanças feitas pelo servidor
-- (automações); todo acesso é filtrado pelo org_id do próprio negócio.
create or replace function public.converte_lead_ganho_em_paciente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_etapa text;
  v_contato public.contacts%rowtype;
  v_paciente uuid;
  v_fone text;
begin
  if new.stage_id is null or new.contact_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.stage_id is not distinct from new.stage_id then
    return new;
  end if;

  select name into v_etapa from public.pipeline_stages where id = new.stage_id;
  if v_etapa is distinct from 'Ganho' then
    return new;
  end if;

  select * into v_contato from public.contacts where id = new.contact_id and org_id = new.org_id;
  if not found then
    return new;
  end if;

  -- Já convertido antes (ex.: saiu de Ganho e voltou)
  v_paciente := nullif(v_contato.metadata->>'patient_id', '')::uuid;
  if v_paciente is not null
     and exists (select 1 from public.patients where id = v_paciente and org_id = new.org_id) then
    return new;
  end if;

  -- Paciente que já existe com o mesmo telefone ou e-mail
  v_fone := regexp_replace(coalesce(v_contato.phone, ''), '\D', '', 'g');
  select p.id into v_paciente
    from public.patients p
   where p.org_id = new.org_id
     and (
       (length(v_fone) >= 8 and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_fone)
       or (coalesce(trim(v_contato.email), '') <> '' and lower(p.email) = lower(trim(v_contato.email)))
     )
   order by p.created_at
   limit 1;

  if v_paciente is null then
    insert into public.patients (org_id, owner_id, first_name, last_name, email, phone, status, notes)
    values (
      new.org_id,
      coalesce(new.owner_id, v_contato.owner_id),
      coalesce(nullif(trim(v_contato.first_name), ''), nullif(trim(new.title), ''), 'Paciente'),
      nullif(trim(v_contato.last_name), ''),
      nullif(trim(v_contato.email), ''),
      coalesce(v_contato.phone, ''),
      'active',
      concat_ws(' · ',
        'Veio do pipeline de leads',
        'canal: ' || nullif(v_contato.canal, ''),
        'anúncio: ' || nullif(v_contato.anuncio, ''))
    )
    returning id into v_paciente;
  end if;

  update public.contacts
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('patient_id', v_paciente)
   where id = v_contato.id;

  return new;
end;
$$;

drop trigger if exists trg_deals_ganho_vira_paciente on public.deals;
create trigger trg_deals_ganho_vira_paciente
  after insert or update of stage_id on public.deals
  for each row execute function public.converte_lead_ganho_em_paciente();
