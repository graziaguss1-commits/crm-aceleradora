export type Temperatura = "quente" | "morno" | "frio";
export type TagCategoria = "temperatura" | "interesse" | "anuncio" | "objecao" | "geral";
export type FollowUpCanal = "WhatsApp" | "Ligação" | "E-mail" | "Presencial";
export type FollowUpStatus = "pendente" | "realizado" | "cancelado";

export const TEMPERATURAS: { value: Temperatura; label: string; className: string }[] = [
  { value: "quente", label: "Quente", className: "bg-destructive/15 text-destructive border-destructive/30" },
  { value: "morno", label: "Morno", className: "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  { value: "frio", label: "Frio", className: "bg-sky-500/15 text-sky-600 border-sky-500/30 dark:text-sky-400" },
];

export const TEMPERATURA_LABELS: Record<Temperatura, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

export const CANAIS = [
  "Meta Ads",
  "Instagram Orgânico",
  "Google",
  "Indicação",
  "WhatsApp",
  "Site",
] as const;

export const FOLLOWUP_CANAIS: FollowUpCanal[] = ["WhatsApp", "Ligação", "E-mail", "Presencial"];

export const TAG_CATEGORIA_LABELS: Record<TagCategoria, string> = {
  temperatura: "Temperatura",
  interesse: "Interesse",
  anuncio: "Anúncio",
  objecao: "Objeção",
  geral: "Geral",
};

/** Categorias oferecidas ao criar uma tag. Temperatura fica de fora: o lead
 *  ja tem campo proprio para isso. */
export const TAG_CATEGORIAS_DISPONIVEIS: TagCategoria[] = ["interesse", "anuncio", "objecao", "geral"];

export const STAGE_NAMES = [
  "Novo Lead",
  "Parou Antes do Valor",
  "Parou Depois do Valor",
  "Ganho",
  "Perdido",
] as const;

export const DEFAULT_PIPELINE_NAME = "Comercial";
export const STAGE_PERDIDO = "Perdido";

export const STAGE_BORDER_COLORS = [
  "border-t-sky-500",
  "border-t-violet-500",
  "border-t-amber-500",
  "border-t-emerald-500",
  "border-t-rose-500",
];

export const TAG_COLORS = ["#ef4444", "#f97316", "#3b82f6", "#22c55e", "#8b5cf6", "#ec4899", "#64748b"];

export interface LeadTag {
  id: string;
  name: string;
  color: string | null;
  categoria: string;
}

export interface LeadFollowUp {
  id: string;
  deal_id: string | null;
  contact_id: string | null;
  data_agendada: string;
  canal: string;
  observacao: string | null;
  status: string;
  realizado_em: string | null;
  resultado: string | null;
  created_at: string;
}

export interface LeadContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  temperatura: string | null;
  canal: string | null;
  anuncio: string | null;
  fonte: string | null;
  status: string | null;
  lead_score: number | null;
  indicado_por_contact_id: string | null;
}

export interface Lead {
  id: string;
  title: string;
  /** O que o lead relatou, nas palavras dele. */
  dor_relatada: string | null;
  value: number | null;
  stage_id: string | null;
  status: string | null;
  created_at: string;
  contact_id: string | null;
  contact: LeadContact | null;
  tags: LeadTag[];
  nextFollowUp: LeadFollowUp | null;
}

export function leadName(lead: Lead) {
  const c = lead.contact;
  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(" ").trim() : "";
  return name || lead.title || "Lead sem nome";
}

export function formatCurrency(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function isOverdue(iso?: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}
