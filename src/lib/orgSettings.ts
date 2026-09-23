import { supabase } from "@/integrations/supabase/client";

/** Prazo padrao, em dias, para considerar um paciente sem retorno. */
export const DIAS_SEM_RETORNO_PADRAO = 30;

/**
 * Le o prazo de "paciente sem retorno" configurado em Configuracoes -> Geral.
 * Volta ao padrao quando nao houver valor gravado ou o valor for invalido.
 */
export async function getDiasSemRetorno(orgId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();

  const bruto = (data?.settings as Record<string, unknown> | null)?.dias_sem_retorno;
  const dias = Number(bruto);
  if (!Number.isFinite(dias) || dias < 1) return DIAS_SEM_RETORNO_PADRAO;
  return Math.min(365, Math.floor(dias));
}

/* ------------------------------------------------------------------ */
/* Horario de atendimento                                              */
/* ------------------------------------------------------------------ */

export interface DiaAtendimento {
  /** Se a clinica atende neste dia. */
  aberto: boolean;
  /** Hora de abertura, 0-23. */
  inicio: number;
  /** Hora de fechamento, 1-24. */
  fim: number;
}

/** Indice 0 = domingo, 6 = sabado (mesma convencao de Date.getDay()). */
export type HorarioAtendimento = DiaAtendimento[];

export const DIAS_SEMANA = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
] as const;

export const HORARIO_PADRAO: HorarioAtendimento = [
  { aberto: false, inicio: 8, fim: 12 }, // domingo
  { aberto: true, inicio: 8, fim: 19 },
  { aberto: true, inicio: 8, fim: 19 },
  { aberto: true, inicio: 8, fim: 19 },
  { aberto: true, inicio: 8, fim: 19 },
  { aberto: true, inicio: 8, fim: 19 },
  { aberto: false, inicio: 8, fim: 12 }, // sabado
];

function normalizarDia(bruto: unknown, padrao: DiaAtendimento): DiaAtendimento {
  const d = bruto as Partial<DiaAtendimento> | undefined;
  const inicio = Number(d?.inicio);
  const fim = Number(d?.fim);
  const iniOk = Number.isFinite(inicio) ? Math.min(23, Math.max(0, Math.floor(inicio))) : padrao.inicio;
  const fimBruto = Number.isFinite(fim) ? Math.min(24, Math.max(1, Math.floor(fim))) : padrao.fim;
  return {
    aberto: typeof d?.aberto === "boolean" ? d.aberto : padrao.aberto,
    inicio: iniOk,
    // Fechamento sempre depois da abertura.
    fim: fimBruto > iniOk ? fimBruto : Math.min(24, iniOk + 1),
  };
}

export function normalizarHorario(bruto: unknown): HorarioAtendimento {
  if (!Array.isArray(bruto) || bruto.length !== 7) return HORARIO_PADRAO;
  return HORARIO_PADRAO.map((padrao, i) => normalizarDia(bruto[i], padrao));
}

export async function getHorarioAtendimento(orgId: string): Promise<HorarioAtendimento> {
  const { data } = await (supabase as any)
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();
  return normalizarHorario((data?.settings as Record<string, unknown> | null)?.horario_atendimento);
}

/** Faixa de horas que a grade da agenda precisa exibir. */
export function faixaDaGrade(horario: HorarioAtendimento) {
  const abertos = horario.filter((d) => d.aberto);
  if (abertos.length === 0) return { inicio: 8, fim: 19 };
  return {
    inicio: Math.min(...abertos.map((d) => d.inicio)),
    fim: Math.max(...abertos.map((d) => d.fim)),
  };
}
