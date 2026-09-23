-- 1. Leads (contacts)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS temperatura text,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS anuncio text,
  ADD COLUMN IF NOT EXISTS indicado_por_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD CONSTRAINT contacts_temperatura_check
  CHECK (temperatura IS NULL OR temperatura IN ('quente','morno','frio'));

CREATE INDEX IF NOT EXISTS idx_contacts_org ON public.contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_indicado_por ON public.contacts(indicado_por_contact_id);

-- 2. Tags: categoria
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS categoria text NOT NULL DEFAULT 'geral';

ALTER TABLE public.tags
  ADD CONSTRAINT tags_categoria_check
  CHECK (categoria IN ('temperatura','interesse','anuncio','objecao','geral'));

-- 3. contact_tags
CREATE TABLE public.contact_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, tag_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_tags TO authenticated;
GRANT ALL ON public.contact_tags TO service_role;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access contact_tags" ON public.contact_tags
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());
CREATE INDEX idx_contact_tags_contact ON public.contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON public.contact_tags(tag_id);

-- 4. objecoes
CREATE TABLE public.objecoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text DEFAULT '#ef4444',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, label)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.objecoes TO authenticated;
GRANT ALL ON public.objecoes TO service_role;
ALTER TABLE public.objecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access objecoes" ON public.objecoes
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());
CREATE TRIGGER trg_objecoes_touch BEFORE UPDATE ON public.objecoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. deal_objecoes
CREATE TABLE public.deal_objecoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  objecao_id uuid NOT NULL REFERENCES public.objecoes(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, objecao_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_objecoes TO authenticated;
GRANT ALL ON public.deal_objecoes TO service_role;
ALTER TABLE public.deal_objecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access deal_objecoes" ON public.deal_objecoes
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());
CREATE INDEX idx_deal_objecoes_deal ON public.deal_objecoes(deal_id);

-- 6. follow_ups
CREATE TABLE public.follow_ups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  data_agendada timestamptz NOT NULL DEFAULT now(),
  canal text NOT NULL DEFAULT 'WhatsApp',
  observacao text,
  status text NOT NULL DEFAULT 'pendente',
  realizado_em timestamptz,
  resultado text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT follow_ups_status_check CHECK (status IN ('pendente','realizado','cancelado')),
  CONSTRAINT follow_ups_canal_check CHECK (canal IN ('WhatsApp','Ligação','E-mail','Presencial'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members access follow_ups" ON public.follow_ups
  FOR ALL TO authenticated
  USING (org_id = public.current_org_id())
  WITH CHECK (org_id = public.current_org_id());
CREATE TRIGGER trg_follow_ups_touch BEFORE UPDATE ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_follow_ups_deal ON public.follow_ups(deal_id);
CREATE INDEX idx_follow_ups_pendentes ON public.follow_ups(org_id, status, data_agendada);

-- 7. Histórico de mudanças de etapa
CREATE TABLE public.deal_stage_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.deal_stage_history TO authenticated;
GRANT ALL ON public.deal_stage_history TO service_role;
ALTER TABLE public.deal_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members read deal_stage_history" ON public.deal_stage_history
  FOR SELECT TO authenticated USING (org_id = public.current_org_id());
CREATE POLICY "Org members insert deal_stage_history" ON public.deal_stage_history
  FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org_id());
CREATE INDEX idx_deal_stage_history_deal ON public.deal_stage_history(deal_id, created_at);

CREATE OR REPLACE FUNCTION public.log_deal_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_stage_history (org_id, deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.org_id, NEW.id, NULL, NEW.stage_id, auth.uid());
  ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.deal_stage_history (org_id, deal_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.org_id, NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deals_stage_history
AFTER INSERT OR UPDATE OF stage_id ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.log_deal_stage_change();

CREATE TRIGGER trg_deals_touch BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_contacts_touch BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();