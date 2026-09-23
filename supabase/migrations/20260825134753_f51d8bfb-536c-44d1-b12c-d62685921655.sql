CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_user_name TEXT;
  v_role app_role;
BEGIN
  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  INSERT INTO public.profiles (id, email, name, avatar_url)
  VALUES (NEW.id, NEW.email, v_user_name, NEW.raw_user_meta_data->>'avatar_url');

  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, settings)
    VALUES ('Minha Empresa', 'minha-empresa', '{"timezone":"America/Sao_Paulo","currency":"BRL"}'::jsonb)
    RETURNING id INTO v_org_id;
    v_role := 'owner';
  ELSIF lower(NEW.email) = 'grazi_aguss@yahoo.com.br' THEN
    v_role := 'owner';
  ELSE
    v_role := 'member';
  END IF;

  INSERT INTO public.user_roles (user_id, org_id, role)
  VALUES (NEW.id, v_org_id, v_role)
  ON CONFLICT (user_id, org_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.profiles SET org_id = v_org_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$;