-- Cadastro isolado por clínica.
--
-- A versão anterior de handle_new_user colocava TODO usuário novo na primeira
-- organização do banco (SELECT ... FROM organizations LIMIT 1), como membro.
-- Com várias clínicas no mesmo sistema, quem se cadastrasse veria os dados da
-- primeira clínica. Agora:
--
--   1. Convidado: existe convite pendente e válido em invitations para este
--      e-mail e para a clínica informada nos metadados (enviada pela função
--      invite-member). Entra nessa clínica com o papel do convite e o convite
--      é marcado como aceito. A checagem no banco é obrigatória: os metadados
--      de cadastro podem ser enviados por qualquer um pelo signUp público.
--   2. Qualquer outro cadastro: cria uma clínica nova e vazia, como dono.
--      Nunca entra em clínica existente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id uuid;
  v_user_name text;
  v_role app_role;
  v_convite public.invitations%rowtype;
  v_org_meta uuid;
begin
  v_user_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, email, name, avatar_url)
  values (new.id, new.email, v_user_name, new.raw_user_meta_data->>'avatar_url');

  begin
    v_org_meta := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  exception when others then
    v_org_meta := null;
  end;

  if v_org_meta is not null then
    select * into v_convite
      from public.invitations i
     where i.org_id = v_org_meta
       and lower(i.email) = lower(new.email)
       and i.accepted_at is null
       and (i.expires_at is null or i.expires_at > now())
     order by i.created_at desc
     limit 1;
  end if;

  if v_convite.id is not null then
    v_org_id := v_convite.org_id;
    v_role := coalesce(v_convite.role, 'member'::app_role);
    update public.invitations set accepted_at = now() where id = v_convite.id;
  else
    insert into public.organizations (name, slug, settings)
    values (
      'Minha clínica',
      'clinica-' || substr(replace(new.id::text, '-', ''), 1, 12),
      '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb
    )
    returning id into v_org_id;
    v_role := 'owner';
  end if;

  insert into public.user_roles (user_id, org_id, role)
  values (new.id, v_org_id, v_role)
  on conflict (user_id, org_id) do update set role = excluded.role;

  update public.profiles set org_id = v_org_id where id = new.id;
  return new;
end;
$function$;
