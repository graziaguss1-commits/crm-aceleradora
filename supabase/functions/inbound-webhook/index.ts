// SISA-SEC-2026-11-06: webhook de entrada exige chave de API da clínica
// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Recebe leads/registros de ferramentas externas (formulários, Make, Zapier).
 *
 * Antes a clínica vinha só de ?org_id= na URL, sem senha: quem soubesse o id
 * gravava e alterava dados de qualquer clínica. Agora a clínica vem da CHAVE DE
 * API (a mesma da public-api), enviada em "Authorization: Bearer <chave>" ou,
 * para ferramentas que não deixam mandar cabeçalho, em ?key=<chave>.
 * Clínica desativada não recebe nada. Referências (contato, negócio, empresa,
 * pipeline, etapa) precisam ser da mesma clínica.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function orgDaChave(sb: any, apiKey: string): Promise<string | null> {
  const { data: chave } = await sb
    .from("api_keys")
    .select("id, org_id, request_count")
    .eq("key_hash", await sha256Hex(apiKey))
    .eq("is_active", true)
    .maybeSingle();
  if (!chave) return null;
  const { data: org } = await sb.from("organizations").select("ativa").eq("id", chave.org_id).maybeSingle();
  if (!org?.ativa) return null;
  await sb.from("api_keys").update({
    last_used_at: new Date().toISOString(),
    request_count: (chave.request_count ?? 0) + 1,
  }).eq("id", chave.id);
  return chave.org_id;
}

// Campo de referência -> tabela onde ele precisa existir na mesma clínica.
// Em activities, contact_id aponta para patients.
function tabelaDaReferencia(tabela: string, campo: string): string | null {
  if (campo === "contact_id") return tabela === "activities" ? "patients" : "contacts";
  if (campo === "deal_id") return "deals";
  if (campo === "company_id") return "companies";
  if (campo === "pipeline_id") return "pipelines";
  if (campo === "indicado_por_contact_id") return "contacts";
  return null;
}

async function referenciasDaClinica(sb: any, orgId: string, tabela: string, dados: Record<string, unknown>) {
  for (const [campo, valor] of Object.entries(dados)) {
    if (valor == null || valor === "") continue;
    if (campo === "stage_id") {
      const { data } = await sb
        .from("pipeline_stages")
        .select("id, pipelines!inner(org_id)")
        .eq("id", valor)
        .eq("pipelines.org_id", orgId)
        .maybeSingle();
      if (!data) return `stage_id não pertence a esta clínica`;
      continue;
    }
    const alvo = tabelaDaReferencia(tabela, campo);
    if (!alvo) continue;
    const { data } = await sb.from(alvo).select("id").eq("id", valor).eq("org_id", orgId).maybeSingle();
    if (!data) return `${campo} não pertence a esta clínica`;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    const apiKey = bearer || url.searchParams.get("key") || "";
    if (!apiKey) return json({ error: "Chave de API obrigatória (Authorization: Bearer <chave> ou ?key=<chave>)" }, 401);

    const orgId = await orgDaChave(sb, apiKey);
    if (!orgId) return json({ error: "Chave de API inválida, revogada ou de clínica inativa" }, 401);

    // Compatibilidade com URLs antigas: se vier org_id, tem que ser o da chave
    const orgParam = url.searchParams.get("org_id");
    if (orgParam && orgParam !== orgId) return json({ error: "org_id não corresponde à chave" }, 403);

    const body = await req.json();
    const { entity, action, data } = body ?? {};
    if (!entity || !data || typeof data !== "object") return json({ error: "entity and data required" }, 400);

    const tableName = entity === "contact" ? "contacts"
      : entity === "company" ? "companies"
      : entity === "deal" ? "deals"
      : entity === "activity" ? "activities"
      : null;
    if (!tableName) return json({ error: "Invalid entity" }, 400);

    const { id, org_id: _ignorado, ...campos } = data as Record<string, unknown>;

    const erroRef = await referenciasDaClinica(sb, orgId, tableName, campos);
    if (erroRef) return json({ error: erroRef }, 400);

    let result;
    if (action === "create" || !action) {
      result = await sb.from(tableName).insert({ ...campos, org_id: orgId }).select().single();
    } else if (action === "update" && id) {
      result = await sb.from(tableName).update(campos).eq("id", id).eq("org_id", orgId).select().single();
    } else {
      return json({ error: "Invalid action" }, 400);
    }

    if (result.error) return json({ error: result.error.message }, 500);
    return json({ success: true, data: result.data });
  } catch (e) {
    console.error("inbound-webhook error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
