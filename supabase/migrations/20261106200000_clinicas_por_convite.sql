-- SISA para várias clínicas, com acesso liberado pela Grazi (modelo "opção 1").
--
-- Um sistema só, várias clínicas isoladas. Quem libera uma clínica é o admin
-- da plataforma: cadastra a clínica e gera um link de convite para o dono.
-- Ninguém cria clínica sozinho e ninguém se cadastra sem convite.

-- 1. Admin da plataforma ---------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- sem regras: só as funções security definer abaixo leem esta tabela

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;
grant execute on function public.is_platform_admin() to authenticated;

insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'grazi_aguss@yahoo.com.br'
on conflict do nothing;

-- 2. Clínica ativa / desativada ---------------------------------------------
alter table public.organizations add column if not exists ativa boolean not null default true;

-- Todas as regras de acesso usam current_org_id(). Clínica desativada devolve
-- null, então a equipe dela deixa de ver e gravar qualquer dado na hora.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.org_id
    from public.profiles p
    join public.organizations o on o.id = p.org_id
   where p.id = auth.uid()
     and o.ativa;
$$;

-- Só o admin da plataforma liga ou desliga uma clínica
create or replace function public.protege_org_ativa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ativa is distinct from old.ativa and not public.is_platform_admin() then
    raise exception 'Somente o admin da plataforma altera a situação da clínica';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protege_org_ativa on public.organizations;
create trigger trg_protege_org_ativa before update on public.organizations
  for each row execute function public.protege_org_ativa();

-- Situação da clínica do usuário logado, mesmo desativada (para a tela de
-- acesso suspenso). Não expõe dado nenhum além do nome.
create or replace function public.minha_clinica_situacao()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p.org_id is null then jsonb_build_object('tem_clinica', false, 'ativa', false, 'nome', null)
    else jsonb_build_object('tem_clinica', true, 'ativa', o.ativa, 'nome', o.name)
  end
    from public.profiles p
    left join public.organizations o on o.id = p.org_id
   where p.id = auth.uid();
$$;
grant execute on function public.minha_clinica_situacao() to authenticated;

-- 3. Fecha a criação de clínica por conta própria ---------------------------
drop policy if exists "Authenticated insert orgs" on public.organizations;

-- Aceitava p_user_id de qualquer pessoa: dava para tirar outro usuário da
-- própria clínica. Agora só o admin da plataforma usa.
create or replace function public.create_organization_for_user(p_user_id uuid, p_name text, p_slug text, p_settings jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Clínicas são liberadas pela administração do SISA';
  end if;
  insert into public.organizations (name, slug, settings)
  values (p_name, p_slug, p_settings)
  returning id into v_org_id;
  insert into public.user_roles (user_id, org_id, role) values (p_user_id, v_org_id, 'owner');
  update public.profiles set org_id = v_org_id where id = p_user_id;
  return v_org_id;
end;
$$;

-- 4. Convite ----------------------------------------------------------------
-- Dados públicos de um convite, para a tela de cadastro (sem login).
create or replace function public.convite_info(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'email', i.email,
    'clinica', o.name,
    'valido', (i.accepted_at is null and (i.expires_at is null or i.expires_at > now()) and o.ativa)
  )
    from public.invitations i
    join public.organizations o on o.id = i.org_id
   where i.token = p_token
   limit 1;
$$;
grant execute on function public.convite_info(text) to anon, authenticated;

-- Cadastro: só com convite válido para o mesmo e-mail (token do link ou
-- convite pendente da clínica informada). Banco vazio (primeiro uso de uma
-- instalação nova): o primeiro usuário cria a clínica e vira admin.
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
  v_token text;
begin
  v_user_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  v_token := nullif(new.raw_user_meta_data->>'convite', '');
  begin
    v_org_meta := nullif(new.raw_user_meta_data->>'org_id', '')::uuid;
  exception when others then
    v_org_meta := null;
  end;

  select i.* into v_convite
    from public.invitations i
    join public.organizations o on o.id = i.org_id
   where lower(i.email) = lower(new.email)
     and i.accepted_at is null
     and (i.expires_at is null or i.expires_at > now())
     and o.ativa
     and ((v_token is not null and i.token = v_token) or (v_org_meta is not null and i.org_id = v_org_meta))
   order by i.created_at desc
   limit 1;

  if v_convite.id is not null then
    v_org_id := v_convite.org_id;
    v_role := coalesce(v_convite.role, 'member'::app_role);
    update public.invitations set accepted_at = now() where id = v_convite.id;
  elsif not exists (select 1 from public.organizations) then
    insert into public.organizations (name, slug, settings)
    values ('Minha clínica', 'clinica-' || substr(replace(new.id::text, '-', ''), 1, 12),
            '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    returning id into v_org_id;
    v_role := 'owner';
    insert into public.platform_admins (user_id) values (new.id) on conflict do nothing;
  else
    raise exception 'O cadastro no SISA é feito somente por convite. Peça o link de acesso à sua clínica.';
  end if;

  insert into public.profiles (id, email, name, avatar_url, org_id)
  values (new.id, new.email, v_user_name, new.raw_user_meta_data->>'avatar_url', v_org_id);

  insert into public.user_roles (user_id, org_id, role)
  values (new.id, v_org_id, v_role)
  on conflict (user_id, org_id) do update set role = excluded.role;

  return new;
end;
$function$;

-- 5. Painel do admin da plataforma -------------------------------------------
-- Só números e cadastro da clínica; nenhum dado de paciente ou de lead.
create or replace function public.admin_listar_clinicas()
returns table (
  id uuid,
  nome text,
  ativa boolean,
  criada_em timestamptz,
  donos text,
  usuarios bigint,
  convites_pendentes bigint,
  leads_30d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração do SISA';
  end if;
  return query
  select o.id, o.name, o.ativa, o.created_at,
         (select string_agg(p.email, ', ') from public.user_roles r join public.profiles p on p.id = r.user_id
           where r.org_id = o.id and r.role = 'owner'),
         (select count(*) from public.profiles p where p.org_id = o.id),
         (select count(*) from public.invitations i where i.org_id = o.id and i.accepted_at is null and (i.expires_at is null or i.expires_at > now())),
         (select count(*) from public.deals d where d.org_id = o.id and d.created_at > now() - interval '30 days')
    from public.organizations o
   order by o.created_at desc;
end;
$$;
grant execute on function public.admin_listar_clinicas() to authenticated;

create or replace function public.admin_criar_clinica(p_nome text, p_email_dono text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_token text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração do SISA';
  end if;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_email_dono), '') = '' then
    raise exception 'Informe o nome da clínica e o e-mail do dono';
  end if;
  insert into public.organizations (name, slug, settings)
  values (trim(p_nome),
          'clinica-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
  returning id into v_org;
  insert into public.invitations (org_id, email, role, invited_by, expires_at)
  values (v_org, lower(trim(p_email_dono)), 'owner', auth.uid(), now() + interval '30 days')
  returning token into v_token;
  return jsonb_build_object('org_id', v_org, 'token', v_token);
end;
$$;
grant execute on function public.admin_criar_clinica(text, text) to authenticated;

create or replace function public.admin_gerar_convite(p_org uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração do SISA';
  end if;
  insert into public.invitations (org_id, email, role, invited_by, expires_at)
  values (p_org, lower(trim(p_email)), 'owner', auth.uid(), now() + interval '30 days')
  returning token into v_token;
  return v_token;
end;
$$;
grant execute on function public.admin_gerar_convite(uuid, text) to authenticated;

create or replace function public.admin_definir_ativa(p_org uuid, p_ativa boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração do SISA';
  end if;
  update public.organizations set ativa = p_ativa where id = p_org;
end;
$$;
grant execute on function public.admin_definir_ativa(uuid, boolean) to authenticated;
