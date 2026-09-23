import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_PIPELINE_NAME, STAGE_NAMES } from "@/components/leads/constants";

const OBJECOES_INICIAIS = [
  "Preço",
  "Vai pensar",
  "Falta de tempo",
  "Distância",
  "Quer plano de saúde",
  "Consultou o cônjuge",
  "Sumiu / não respondeu",
];

const STAGE_PROBABILITIES = [10, 30, 60, 100, 0];

/**
 * Garante a configuração inicial do CRM de leads (idempotente):
 * pipeline "Comercial" com 5 etapas, tags de temperatura e objeções padrão.
 * Retorna o id do pipeline comercial.
 */
export async function seedLeadsConfig(orgId: string): Promise<string | null> {
  if (!orgId) return null;

  // 1. Pipeline
  // Resolve pelo is_default primeiro: assim renomear o pipeline na tela de
  // Configuracoes nao faz o CRM criar um segundo pipeline vazio. O nome so e
  // usado como fallback, para orgs criadas antes desta mudanca.
  const { data: pipelines } = await supabase
    .from("pipelines")
    .select("id, name, is_default")
    .eq("org_id", orgId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  const lista = pipelines ?? [];
  let pipelineId =
    lista.find((p) => p.is_default)?.id ??
    lista.find((p) => p.name === DEFAULT_PIPELINE_NAME)?.id ??
    null;

  if (!pipelineId) {
    const { data: created, error } = await supabase
      .from("pipelines")
      .insert({ org_id: orgId, name: DEFAULT_PIPELINE_NAME, currency: "BRL", is_default: true })
      .select("id")
      .single();
    if (error) throw error;
    pipelineId = created.id;
  }

  // 2. Etapas
  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .eq("pipeline_id", pipelineId);

  const existingStages = new Set((stages ?? []).map((s) => s.name));
  const missingStages = STAGE_NAMES.map((name, i) => ({ name, i })).filter((s) => !existingStages.has(s.name));

  if (missingStages.length) {
    const { error } = await supabase.from("pipeline_stages").insert(
      missingStages.map(({ name, i }) => ({
        pipeline_id: pipelineId!,
        name,
        position: i + 1,
        probability: STAGE_PROBABILITIES[i],
      })),
    );
    if (error) throw error;
  }

  // 3. Objeções
  const { data: objecoes } = await supabase.from("objecoes").select("label").eq("org_id", orgId);
  const existingObj = new Set((objecoes ?? []).map((o) => o.label));
  const missingObj = OBJECOES_INICIAIS.filter((label) => !existingObj.has(label));
  if (missingObj.length) {
    await supabase.from("objecoes").insert(missingObj.map((label) => ({ org_id: orgId, label })));
  }

  return pipelineId;
}
