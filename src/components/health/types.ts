export type PatientStatus = "active" | "inactive";

export interface Patient {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
  cpf: string | null;
  date_of_birth: string | null;
  blood_type: string | null;
  allergies: string | null;
  health_plan: string | null;
  health_plan_number: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  notes: string | null;
  avatar_url: string | null;
  owner_id: string | null;
  status: PatientStatus;
  no_show_count: number;
  created_at: string;
  updated_at: string;
}

export type PatientInsert = Omit<Patient, "id" | "created_at" | "updated_at" | "no_show_count"> & {
  no_show_count?: number;
};

export type PatientUpdate = Partial<Omit<Patient, "id" | "org_id" | "created_at" | "updated_at">>;

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Não sei"] as const;

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

export type AppointmentType =
  | "consulta"
  | "retorno"
  | "procedimento"
  | "avaliacao"
  | "urgencia";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  attended: "Atendida",
  no_show: "Não compareceu",
  cancelled: "Cancelada",
};

export const APPOINTMENT_STATUS_BADGE: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800 border-blue-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  attended: "bg-gray-100 text-gray-700 border-gray-200",
  no_show: "bg-amber-100 text-amber-800 border-amber-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
};

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  consulta: "Primeira consulta",
  retorno: "Consulta recorrente",
  procedimento: "Procedimento",
  avaliacao: "Avaliação",
  urgencia: "Urgência",
};

/** Cor de cada tipo de consulta na grade da agenda: faixa lateral e fundo. */
export const APPOINTMENT_TYPE_COLORS: Record<AppointmentType, { faixa: string; fundo: string; ponto: string }> = {
  consulta:     { faixa: "border-l-emerald-500", fundo: "bg-emerald-500/10", ponto: "bg-emerald-500" },
  retorno:      { faixa: "border-l-violet-500",  fundo: "bg-violet-500/10",  ponto: "bg-violet-500" },
  procedimento: { faixa: "border-l-amber-500",   fundo: "bg-amber-500/10",   ponto: "bg-amber-500" },
  avaliacao:    { faixa: "border-l-sky-600",     fundo: "bg-sky-600/10",     ponto: "bg-sky-600" },
  urgencia:     { faixa: "border-l-rose-500",    fundo: "bg-rose-500/10",    ponto: "bg-rose-500" },
};

/** Usado quando a consulta nao tem tipo definido. */
export const APPOINTMENT_TYPE_SEM_TIPO = {
  faixa: "border-l-muted-foreground/40",
  fundo: "bg-muted/40",
  ponto: "bg-muted-foreground/50",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  insurance: "Convênio",
  cash: "Dinheiro",
  transfer: "Transferência",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  refunded: "Reembolsado",
};

export const PAYMENT_STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  overdue: "bg-rose-100 text-rose-800 border-rose-200",
  refunded: "bg-gray-100 text-gray-700 border-gray-200",
};

export const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function maskCpf(cpf: string | null | undefined): string {
  if (!cpf) return "—";
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
}

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export function fullName(p: Pick<Patient, "first_name" | "last_name">): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Sem nome";
}
