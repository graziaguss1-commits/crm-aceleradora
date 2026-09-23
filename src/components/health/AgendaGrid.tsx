import { useMemo } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FileText, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { faixaDaGrade, type HorarioAtendimento } from "@/lib/orgSettings";
import {
  APPOINTMENT_STATUS_BADGE,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_COLORS,
  APPOINTMENT_TYPE_SEM_TIPO,
  AppointmentStatus,
  AppointmentType,
  fullName,
} from "@/components/health/types";

const ALTURA_HORA = 64; // px por hora

export interface GridAppointment {
  id: string;
  title: string;
  body: string | null;
  due_date: string | null;
  appointment_status: AppointmentStatus;
  appointment_type?: AppointmentType | null;
  duration_minutes: number | null;
  patient?: { id: string; first_name: string; last_name: string | null; phone: string } | null;
  professional?: { id: string; name: string } | null;
}

export interface GridBloqueio {
  id: string;
  titulo: string;
  inicio: string;
  fim: string;
  observacao: string | null;
  grupo_id?: string | null;
  professional?: { name: string } | null;
}

interface AgendaGridProps {
  modo: "semana" | "dia";
  cursor: Date;
  consultas: GridAppointment[];
  bloqueios: GridBloqueio[];
  onSelecionarConsulta: (id: string) => void;
  onSelecionarBloqueio: (id: string) => void;
  /** Clique num espaco vazio: recebe o horario exato daquela faixa. */
  onSelecionarVazio?: (quando: Date) => void;
  /** Horario de atendimento da clinica, de Configuracoes -> Horários. */
  horario: HorarioAtendimento;
}



function minutosDoDia(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

/** Hora esta dentro do expediente daquele dia da semana? */
function dentroDoExpediente(horario: HorarioAtendimento, dia: Date, hora: number) {
  const d = horario[dia.getDay()];
  return d.aberto && hora >= d.inicio && hora < d.fim;
}

/** Posicao vertical (em px) de um horario dentro da grade. */
function topo(d: Date, horaInicio: number) {
  return ((minutosDoDia(d) - horaInicio * 60) / 60) * ALTURA_HORA;
}

function altura(minutos: number) {
  return Math.max((minutos / 60) * ALTURA_HORA, 28);
}

export function AgendaGrid({
  modo,
  cursor,
  consultas,
  bloqueios,
  onSelecionarConsulta,
  onSelecionarBloqueio,
  onSelecionarVazio,
  horario,
}: AgendaGridProps) {
  const faixa = useMemo(() => faixaDaGrade(horario), [horario]);
  const HORAS = useMemo(
    () => Array.from({ length: Math.max(1, faixa.fim - faixa.inicio) }, (_, i) => faixa.inicio + i),
    [faixa],
  );
  const dias = useMemo(() => {
    if (modo === "dia") return [cursor];
    const inicio = startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(inicio, i));
  }, [modo, cursor]);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div
        className="grid min-w-[720px]"
        style={{ gridTemplateColumns: `56px repeat(${dias.length}, minmax(0, 1fr))` }}
      >
        {/* Cabecalho */}
        <div className="sticky left-0 z-20 border-b border-r bg-card" />
        {dias.map((d) => {
          const hoje = isSameDay(d, new Date());
          return (
            <div
              key={d.toISOString()}
              className={cn("border-b border-r px-2 py-2 text-center", hoje && "bg-primary/5")}
            >
              <p className="text-xs capitalize text-muted-foreground">
                {format(d, modo === "dia" ? "EEEE" : "EEE", { locale: ptBR })}
              </p>
              {!horario[d.getDay()].aberto && (
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fechado</p>
              )}
              <p
                className={cn(
                  "mt-0.5 text-lg font-semibold tabular-nums",
                  hoje && "inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground",
                )}
              >
                {format(d, "d")}
              </p>
            </div>
          );
        })}

        {/* Coluna das horas */}
        <div className="sticky left-0 z-10 border-r bg-card">
          {HORAS.map((h) => (
            <div key={h} className="relative border-b" style={{ height: ALTURA_HORA }}>
              <span className="absolute -top-2 right-2 text-[11px] tabular-nums text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}
        </div>

        {/* Colunas dos dias */}
        {dias.map((dia) => {
          const doDia = consultas.filter((c) => c.due_date && isSameDay(new Date(c.due_date), dia));
          const blocosDoDia = bloqueios.filter((b) => isSameDay(new Date(b.inicio), dia));

          return (
            <div key={dia.toISOString()} className="relative border-r">
              {HORAS.map((h) => (
                <div
                  key={h}
                  className={cn(
                    "border-b transition-colors hover:bg-muted/40",
                    !dentroDoExpediente(horario, dia, h) && "bg-muted/50",
                  )}
                  style={{ height: ALTURA_HORA }}
                  onClick={() => {
                    if (!onSelecionarVazio) return;
                    const quando = new Date(dia);
                    quando.setHours(h, 0, 0, 0);
                    onSelecionarVazio(quando);
                  }}
                />
              ))}

              {blocosDoDia.map((b) => {
                const ini = new Date(b.inicio);
                const fim = new Date(b.fim);
                const mins = (fim.getTime() - ini.getTime()) / 60000;
                return (
                  <button
                    key={b.id}
                    onClick={() => onSelecionarBloqueio(b.id)}
                    className="absolute left-1 right-1 z-10 overflow-hidden rounded-md border border-dashed border-muted-foreground/40 bg-muted/70 px-2 py-1 text-left"
                    style={{ top: topo(ini, faixa.inicio), height: altura(mins) }}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Lock className="h-3 w-3 shrink-0" />
                      {format(ini, "HH:mm")}–{format(fim, "HH:mm")}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{b.titulo}</span>
                  </button>
                );
              })}

              {doDia.map((c) => {
                const ini = new Date(c.due_date!);
                const mins = c.duration_minutes ?? 30;
                const nome = c.patient ? fullName(c.patient) : c.title;
                const cancelada = c.appointment_status === "cancelled";
                const cor = c.appointment_type
                  ? APPOINTMENT_TYPE_COLORS[c.appointment_type]
                  : APPOINTMENT_TYPE_SEM_TIPO;
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelecionarConsulta(c.id)}
                    className={cn(
                      "absolute left-1 right-1 z-10 overflow-hidden rounded-md border border-l-4 px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md",
                      cor.faixa,
                      cancelada ? "bg-card opacity-60" : cor.fundo,
                    )}
                    style={{ top: topo(ini, faixa.inicio), height: altura(mins) }}
                  >
                    <span className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold tabular-nums">{format(ini, "HH:mm")}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-1.5 text-[10px] leading-4",
                          APPOINTMENT_STATUS_BADGE[c.appointment_status],
                        )}
                      >
                        {APPOINTMENT_STATUS_LABELS[c.appointment_status]}
                      </span>
                    </span>
                    <span className={cn("block truncate text-sm font-medium", cancelada && "line-through")}>
                      {nome}
                    </span>
                    {c.body && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.body}</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
