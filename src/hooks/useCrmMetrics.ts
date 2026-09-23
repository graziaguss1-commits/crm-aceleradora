import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useLeadsBoard, type Stage } from "@/hooks/useLeads";
import type { Lead, Temperatura } from "@/components/leads/constants";

export const PERIODOS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "mes", label: "Este mês" },
  { value: "mes-anterior", label: "Mês passado" },
  { value: "todos", label: "Todo o período" },
  { value: "custom", label: "Escolher datas…" },
] as const;

export type PeriodoValue = (typeof PERIODOS)[number]["value"];

/** Datas escolhidas a mão, no formato yyyy-mm-dd dos inputs. */
export interface PeriodoCustom {
  de: string;
  ate: string;
}

export const STAGE_GANHO = "Ganho";

export interface Contagem {
  label: string;
  total: number;
  convertidos: number;
}

/** Objeções registradas, por deal_id. */
export function useObjecoesPorDeal() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["objecoes-por-deal", orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("deal_objecoes").select("deal_id,objecoes(label)");
      const mapa = new Map<string, string[]>();
      for (const row of (data ?? []) as any[]) {
        const label = row.objecoes?.label;
        if (!label || !row.deal_id) continue;
        mapa.set(row.deal_id, [...(mapa.get(row.deal_id) ?? []), label]);
      }
      return mapa;
    },
  });
}

/** Nome de cada contato da org, para resolver o ranking de indicadores. */
export function useNomesDeContatos() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["nomes-contatos", orgId],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id,first_name,last_name")
        .eq("org_id", orgId!)
        .limit(2000);
      const mapa = new Map<string, string>();
      for (const c of (data ?? []) as any[]) {
        mapa.set(c.id, [c.first_name, c.last_name].filter(Boolean).join(" ").trim() || "Sem nome");
      }
      return mapa;
    },
  });
}

/**
 * Converte o periodo escolhido em um intervalo. `null` em qualquer ponta
 * significa "sem limite daquele lado".
 */
export function intervaloDoPeriodo(
  periodo: PeriodoValue,
  custom?: PeriodoCustom,
): { de: Date | null; ate: Date | null } {
  const agora = new Date();

  if (periodo === "todos") return { de: null, ate: null };

  if (periodo === "mes") {
    return { de: new Date(agora.getFullYear(), agora.getMonth(), 1), ate: null };
  }

  if (periodo === "mes-anterior") {
    return {
      de: new Date(agora.getFullYear(), agora.getMonth() - 1, 1),
      ate: new Date(agora.getFullYear(), agora.getMonth(), 0, 23, 59, 59, 999),
    };
  }

  if (periodo === "custom") {
    // Sem data preenchida, aquela ponta fica em aberto.
    const de = custom?.de ? new Date(`${custom.de}T00:00:00`) : null;
    const ate = custom?.ate ? new Date(`${custom.ate}T23:59:59.999`) : null;
    // Datas invertidas: troca em vez de devolver lista vazia sem explicacao.
    if (de && ate && de > ate) return { de: ate, ate: de };
    return { de, ate };
  }

  const de = new Date(agora);
  de.setHours(0, 0, 0, 0);
  de.setDate(de.getDate() - Number(periodo));
  return { de, ate: null };
}

export function taxa(parte: number, total: number): number {
  return total ? (parte / total) * 100 : 0;
}

export function formatarTaxa(valor: number): string {
  return `${valor.toFixed(1).replace(".", ",")}%`;
}

export function ehConvertido(lead: Lead, stageById: Map<string, Stage>): boolean {
  return lead.stage_id ? stageById.get(lead.stage_id)?.name === STAGE_GANHO : false;
}

export function filtrarLeads(
  leads: Lead[],
  opcoes: { periodo: PeriodoValue; custom?: PeriodoCustom; canal?: string; anuncio?: string },
): Lead[] {
  const { de, ate } = intervaloDoPeriodo(opcoes.periodo, opcoes.custom);
  return leads.filter((l) => {
    const criado = new Date(l.created_at);
    if (de && criado < de) return false;
    if (ate && criado > ate) return false;
    if (opcoes.canal && opcoes.canal !== "todos" && l.contact?.canal !== opcoes.canal) return false;
    if (opcoes.anuncio && opcoes.anuncio !== "todos" && l.contact?.anuncio !== opcoes.anuncio) return false;
    return true;
  });
}

export function agruparPor(
  leads: Lead[],
  stageById: Map<string, Stage>,
  chave: (l: Lead) => string | null | undefined,
): Contagem[] {
  const mapa = new Map<string, Contagem>();
  for (const l of leads) {
    const label = chave(l) || "Não informado";
    const atual = mapa.get(label) ?? { label, total: 0, convertidos: 0 };
    atual.total += 1;
    if (ehConvertido(l, stageById)) atual.convertidos += 1;
    mapa.set(label, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export function porTemperatura(leads: Lead[], stageById: Map<string, Stage>) {
  const chaves: Temperatura[] = ["quente", "morno", "frio"];
  return chaves.map((chave) => {
    const grupo = leads.filter((l) => l.contact?.temperatura === chave);
    const convertidos = grupo.filter((l) => ehConvertido(l, stageById)).length;
    return {
      temperatura: chave,
      total: grupo.length,
      participacao: taxa(grupo.length, leads.length),
      convertidos,
      conversao: taxa(convertidos, grupo.length),
    };
  });
}

export function rankingObjecoes(leads: Lead[], objecoesPorDeal: Map<string, string[]>): Contagem[] {
  const mapa = new Map<string, Contagem>();
  for (const l of leads) {
    for (const label of objecoesPorDeal.get(l.id) ?? []) {
      const atual = mapa.get(label) ?? { label, total: 0, convertidos: 0 };
      atual.total += 1;
      mapa.set(label, atual);
    }
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

export function rankingIndicadores(
  leads: Lead[],
  stageById: Map<string, Stage>,
  nomes: Map<string, string>,
): Contagem[] {
  const mapa = new Map<string, Contagem>();
  for (const l of leads) {
    const indicadorId = l.contact?.indicado_por_contact_id;
    if (!indicadorId) continue;
    const label = nomes.get(indicadorId) ?? "Indicador removido";
    const atual = mapa.get(label) ?? { label, total: 0, convertidos: 0 };
    atual.total += 1;
    if (ehConvertido(l, stageById)) atual.convertidos += 1;
    mapa.set(label, atual);
  }
  return [...mapa.values()].sort((a, b) => b.total - a.total);
}

/** Board + dados auxiliares dos dashboards, já com o índice de etapas montado. */
export function useCrmMetrics() {
  const board = useLeadsBoard();
  const objecoes = useObjecoesPorDeal();
  const nomes = useNomesDeContatos();

  const stageById = new Map<string, Stage>((board.data?.stages ?? []).map((s) => [s.id, s]));

  return {
    isLoading: board.isLoading,
    error: board.error,
    leads: board.data?.leads ?? [],
    stages: board.data?.stages ?? [],
    stageById,
    objecoesPorDeal: objecoes.data ?? new Map<string, string[]>(),
    nomesDeContatos: nomes.data ?? new Map<string, string>(),
  };
}
