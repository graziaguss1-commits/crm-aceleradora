import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { seedLeadsConfig } from "@/lib/leadsSeed";
import type { Lead, LeadContact, LeadFollowUp, LeadTag } from "@/components/leads/constants";

export interface Stage {
  id: string;
  name: string;
  position: number;
  probability: number;
}

export interface LeadsBoard {
  pipelineId: string | null;
  currency: string;
  stages: Stage[];
  leads: Lead[];
}

export function useLeadsBoard() {
  const { orgId } = useOrg();

  return useQuery<LeadsBoard>({
    queryKey: ["leads-board", orgId],
    enabled: !!orgId,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const pipelineId = await seedLeadsConfig(orgId!);
      if (!pipelineId) return { pipelineId: null, currency: "BRL", stages: [], leads: [] };

      const [{ data: pipeline }, { data: stageRows }, { data: dealRows }] = await Promise.all([
        supabase.from("pipelines").select("currency").eq("id", pipelineId).maybeSingle(),
        supabase
          .from("pipeline_stages")
          .select("id,name,position,probability")
          .eq("pipeline_id", pipelineId)
          .order("position"),
        supabase
          .from("deals")
          .select(
            "id,title,dor_relatada,value,stage_id,status,created_at,contact_id," +
              "contacts(id,first_name,last_name,phone,email,temperatura,canal,anuncio,fonte,status,lead_score,indicado_por_contact_id)",
          )
          .eq("org_id", orgId!)
          .eq("pipeline_id", pipelineId)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      const deals = (dealRows ?? []) as any[];
      const contactIds = deals.map((d) => d.contact_id).filter(Boolean) as string[];
      const dealIds = deals.map((d) => d.id);

      const [{ data: tagLinks }, { data: followUps }] = await Promise.all([
        contactIds.length
          ? supabase
              .from("contact_tags")
              .select("contact_id,tags(id,name,color,categoria)")
              .in("contact_id", contactIds)
          : Promise.resolve({ data: [] as any[] }),
        dealIds.length
          ? supabase
              .from("follow_ups")
              .select("*")
              .in("deal_id", dealIds)
              .eq("status", "pendente")
              .order("data_agendada")
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const tagsByContact = new Map<string, LeadTag[]>();
      for (const link of (tagLinks ?? []) as any[]) {
        if (!link.tags) continue;
        const list = tagsByContact.get(link.contact_id) ?? [];
        list.push(link.tags as LeadTag);
        tagsByContact.set(link.contact_id, list);
      }

      const nextByDeal = new Map<string, LeadFollowUp>();
      for (const fu of (followUps ?? []) as LeadFollowUp[]) {
        if (fu.deal_id && !nextByDeal.has(fu.deal_id)) nextByDeal.set(fu.deal_id, fu);
      }

      const leads: Lead[] = deals.map((d) => ({
        id: d.id,
        title: d.title,
        dor_relatada: d.dor_relatada ?? null,
        value: d.value,
        stage_id: d.stage_id,
        status: d.status,
        created_at: d.created_at,
        contact_id: d.contact_id,
        contact: (d.contacts ?? null) as LeadContact | null,
        tags: d.contact_id ? tagsByContact.get(d.contact_id) ?? [] : [],
        nextFollowUp: nextByDeal.get(d.id) ?? null,
      }));

      return {
        pipelineId,
        currency: pipeline?.currency ?? "BRL",
        stages: (stageRows ?? []) as Stage[],
        leads,
      };
    },
  });
}

export function useTags() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["lead-tags", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      // Temperatura tem campo proprio no lead; tags dessa categoria seriam uma
      // segunda fonte de verdade para o mesmo dado, entao ficam de fora.
      const { data } = await supabase
        .from("tags")
        .select("id,name,color,categoria")
        .eq("org_id", orgId!)
        .neq("categoria", "temperatura")
        .order("categoria")
        .order("name");
      return (data ?? []) as LeadTag[];
    },
  });
}

export function useObjecoes() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["objecoes", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("objecoes")
        .select("id,label,color")
        .eq("org_id", orgId!)
        .order("label");
      return (data ?? []) as { id: string; label: string; color: string | null }[];
    },
  });
}

export function useContactsLite() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["contacts-lite", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id,first_name,last_name,phone")
        .eq("org_id", orgId!)
        .order("first_name")
        .limit(500);
      return (data ?? []) as { id: string; first_name: string | null; last_name: string | null; phone: string | null }[];
    },
  });
}

export function useLeadFollowUps(dealId: string | null) {
  return useQuery({
    queryKey: ["lead-follow-ups", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("*")
        .eq("deal_id", dealId!)
        .order("data_agendada", { ascending: false });
      return (data ?? []) as LeadFollowUp[];
    },
  });
}

export function useDealObjecoes(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-objecoes", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data } = await supabase
        .from("deal_objecoes")
        .select("id,objecao_id,objecoes(id,label,color)")
        .eq("deal_id", dealId!);
      return (data ?? []) as any[];
    },
  });
}

export function useStageHistory(dealId: string | null) {
  return useQuery({
    queryKey: ["deal-stage-history", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data } = await supabase
        .from("deal_stage_history")
        .select("id,created_at,from_stage_id,to_stage_id")
        .eq("deal_id", dealId!)
        .order("created_at", { ascending: false });
      return (data ?? []) as { id: string; created_at: string; from_stage_id: string | null; to_stage_id: string | null }[];
    },
  });
}

/** Anuncios ativos da org, para o campo de cadastro de lead. */
export function useAnuncios() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["anuncios", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("anuncios")
        .select("id,nome,canal")
        .eq("org_id", orgId!)
        .eq("ativo", true)
        .order("nome");
      return (data ?? []) as { id: string; nome: string; canal: string | null }[];
    },
  });
}
