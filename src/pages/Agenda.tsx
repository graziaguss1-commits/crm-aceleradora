import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus, Search, Check, XCircle, AlertTriangle, ListChecks, Lock,
  ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarClock, CalendarSearch,
} from "lucide-react";
import { addDays, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppointmentCreateModal } from "@/components/health/AppointmentCreateModal";
import { BloqueioCreateModal } from "@/components/health/BloqueioCreateModal";
import { PatientDrawer } from "@/components/health/PatientDrawer";
import { AgendaGrid, GridAppointment, GridBloqueio } from "@/components/health/AgendaGrid";
import { HORARIO_PADRAO, getHorarioAtendimento, type HorarioAtendimento } from "@/lib/orgSettings";
import {
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_COLORS, APPOINTMENT_TYPE_LABELS,
  AppointmentStatus, AppointmentType, fullName,
} from "@/components/health/types";

interface AppointmentRow extends GridAppointment {
  professional_id: string | null;
  contact_id: string | null;
}

type Modo = "semana" | "dia";

/** Data no formato aceito por input datetime-local, no fuso local. */
function toInputLocal(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export default function Agenda() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const defaultPatient = params.get("patient") ?? undefined;

  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [bloqueios, setBloqueios] = useState<GridBloqueio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");
  const [professionals, setProfessionals] = useState<{ id: string; name: string }[]>([]);
  const [createOpen, setCreateOpen] = useState<boolean>(Boolean(defaultPatient));
  const [bloqueioOpen, setBloqueioOpen] = useState(false);
  const [bloqueioQuando, setBloqueioQuando] = useState<Date | null>(null);
  const [drawerPatientId, setDrawerPatientId] = useState<string | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [remarcando, setRemarcando] = useState(false);
  const [novaData, setNovaData] = useState("");
  const [salvandoRemarcacao, setSalvandoRemarcacao] = useState(false);

  const [horario, setHorario] = useState<HorarioAtendimento>(HORARIO_PADRAO);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("semana");
  const [cursor, setCursor] = useState<Date>(new Date());

  /** Intervalo visivel, base de todas as buscas. */
  const intervalo = useMemo(() => {
    if (modo === "dia") {
      const ini = new Date(cursor); ini.setHours(0, 0, 0, 0);
      const fim = new Date(cursor); fim.setHours(23, 59, 59, 999);
      return { ini, fim };
    }
    return {
      ini: startOfWeek(cursor, { weekStartsOn: 1 }),
      fim: endOfWeek(cursor, { weekStartsOn: 1 }),
    };
  }, [modo, cursor]);

  const fetchProfessionals = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("professionals").select("id,name")
      .eq("org_id", orgId).eq("is_active", true).order("name");
    setProfessionals((data ?? []) as { id: string; name: string }[]);
  }, [orgId]);

  const fetchAgenda = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("activities")
        .select(
          "id,title,body,due_date,appointment_status,appointment_type,duration_minutes,professional_id,contact_id," +
          "patient:patients!activities_contact_id_fkey(id,first_name,last_name,phone)," +
          "professional:professionals!activities_professional_id_fkey(id,name)"
        )
        .eq("org_id", orgId)
        .not("appointment_status", "is", null)
        .gte("due_date", intervalo.ini.toISOString())
        .lte("due_date", intervalo.fim.toISOString())
        .order("due_date");

      if (statusFilter !== "all") q = q.eq("appointment_status", statusFilter);
      if (typeFilter !== "all") q = q.eq("appointment_type", typeFilter);
      if (professionalFilter !== "all") q = q.eq("professional_id", professionalFilter);

      const { data, error } = await q;
      if (error) {
        const { data: raw, error: rawErr } = await (supabase as any)
          .from("activities")
          .select("id,title,body,due_date,appointment_status,appointment_type,duration_minutes,professional_id,contact_id")
          .eq("org_id", orgId)
          .not("appointment_status", "is", null)
          .gte("due_date", intervalo.ini.toISOString())
          .lte("due_date", intervalo.fim.toISOString())
          .order("due_date");
        if (rawErr) throw rawErr;
        setRows((raw ?? []) as AppointmentRow[]);
      } else {
        setRows((data ?? []) as AppointmentRow[]);
      }

      let qb = (supabase as any)
        .from("agenda_bloqueios")
        .select("id,titulo,inicio,fim,observacao,professional_id,grupo_id")
        .eq("org_id", orgId)
        .gte("inicio", intervalo.ini.toISOString())
        .lte("inicio", intervalo.fim.toISOString())
        .order("inicio");
      if (professionalFilter !== "all") {
        qb = qb.or(`professional_id.eq.${professionalFilter},professional_id.is.null`);
      }
      const { data: blocos } = await qb;
      setBloqueios((blocos ?? []) as GridBloqueio[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar agenda", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, typeFilter, professionalFilter, intervalo, toast]);

  useEffect(() => {
    if (!orgId) return;
    let ativo = true;
    void getHorarioAtendimento(orgId).then((h) => { if (ativo) setHorario(h); });
    return () => { ativo = false; };
  }, [orgId]);

  useEffect(() => { void fetchProfessionals(); }, [fetchProfessionals]);
  useEffect(() => { void fetchAgenda(); }, [fetchAgenda]);

  const consultas = useMemo(() => {
    if (!search.trim()) return rows;
    const termo = search.trim().toLowerCase();
    return rows.filter((r) => {
      const nome = r.patient ? fullName(r.patient).toLowerCase() : "";
      return nome.includes(termo) || (r.title ?? "").toLowerCase().includes(termo);
    });
  }, [rows, search]);

  const detalhe = useMemo(
    () => consultas.find((c) => c.id === detalheId) ?? null,
    [consultas, detalheId],
  );

  const updateStatus = async (id: string, status: AppointmentStatus) => {
    try {
      const { error } = await (supabase as any)
        .from("activities").update({ appointment_status: status }).eq("id", id);
      if (error) throw error;
      toast({ title: "Status atualizado", description: APPOINTMENT_STATUS_LABELS[status] });
      setDetalheId(null);
      void fetchAgenda();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const remarcar = async (id: string) => {
    if (!novaData) return;
    setSalvandoRemarcacao(true);
    try {
      const { error } = await (supabase as any)
        .from("activities")
        .update({ due_date: new Date(novaData).toISOString(), appointment_status: "scheduled" })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Consulta remarcada" });
      setRemarcando(false);
      setDetalheId(null);
      void fetchAgenda();
    } catch (err: any) {
      toast({ title: "Erro ao remarcar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSalvandoRemarcacao(false);
    }
  };

  const removerBloqueio = async (id: string, serieInteira: boolean, grupoId?: string | null) => {
    try {
      const alvo = (supabase as any).from("agenda_bloqueios").delete();
      const { error } = serieInteira && grupoId
        ? await alvo.eq("grupo_id", grupoId)
        : await alvo.eq("id", id);
      if (error) throw error;
      toast({ title: serieInteira ? "Série removida" : "Bloqueio removido" });
      void fetchAgenda();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  const navegar = (direcao: -1 | 1) => {
    setCursor((c) => (modo === "dia" ? addDays(c, direcao) : addWeeks(c, direcao)));
  };

  const rotuloPeriodo = modo === "dia"
    ? format(cursor, "EEEE, d 'de' MMMM", { locale: ptBR })
    : `${format(intervalo.ini, "d MMM", { locale: ptBR })} – ${format(intervalo.fim, "d MMM yyyy", { locale: ptBR })}`;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm capitalize text-muted-foreground">{rotuloPeriodo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)}>
            <TabsList>
              <TabsTrigger value="semana"><CalendarRange className="mr-1 h-3.5 w-3.5" /> Semana</TabsTrigger>
              <TabsTrigger value="dia"><CalendarDays className="mr-1 h-3.5 w-3.5" /> Dia</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" onClick={() => { setBloqueioQuando(null); setBloqueioOpen(true); }}>
            <Lock className="mr-2 h-4 w-4" /> Bloquear
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nova consulta
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => navegar(-1)} aria-label="Anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
            <Button variant="outline" size="icon" onClick={() => navegar(1)} aria-label="Próximo">
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Popover open={calendarioAberto} onOpenChange={setCalendarioAberto}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="ml-1 gap-1.5">
                  <CalendarSearch className="h-4 w-4" />
                  <span className="capitalize">{format(cursor, "d MMM yyyy", { locale: ptBR })}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={cursor}
                  defaultMonth={cursor}
                  onSelect={(d) => {
                    if (!d) return;
                    setCursor(d);
                    setCalendarioAberto(false);
                  }}
                  weekStartsOn={1}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar paciente…"
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(APPOINTMENT_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              {Object.entries(APPOINTMENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="w-[190px]"><SelectValue placeholder="Médico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os médicos</SelectItem>
              {professionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(Object.keys(APPOINTMENT_TYPE_LABELS) as AppointmentType[]).map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${APPOINTMENT_TYPE_COLORS[t].ponto}`} />
            {APPOINTMENT_TYPE_LABELS[t]}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <AgendaGrid
          modo={modo}
          cursor={cursor}
          consultas={consultas}
          bloqueios={bloqueios}
          onSelecionarConsulta={setDetalheId}
          onSelecionarBloqueio={(id) => {
            const b = bloqueios.find((x) => x.id === id);
            if (!b) return;
            if (b.grupo_id) {
              // Bloqueio que se repete: separa apagar esta data de apagar a serie.
              if (!window.confirm(`Remover o bloqueio "${b.titulo}" desta data?`)) return;
              const serie = window.confirm(
                "Remover também todas as outras datas dessa repetição?\n\nOK = apaga a série inteira. Cancelar = apaga só esta data.",
              );
              void removerBloqueio(id, serie, b.grupo_id);
              return;
            }
            if (window.confirm(`Remover o bloqueio "${b.titulo}"?`)) void removerBloqueio(id, false);
          }}
          onSelecionarVazio={(quando) => { setBloqueioQuando(quando); setBloqueioOpen(true); }}
          horario={horario}
        />
      )}

      <Sheet open={detalhe !== null} onOpenChange={(o) => { if (!o) { setDetalheId(null); setRemarcando(false); } }}>
        <SheetContent className="w-full sm:max-w-md">
          {detalhe && (
            <>
              <SheetHeader>
                <SheetTitle>{detalhe.patient ? fullName(detalhe.patient) : detalhe.title}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Horário</p>
                  <p className="capitalize">
                    {detalhe.due_date
                      ? format(new Date(detalhe.due_date), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })
                      : "Sem data"}
                    {detalhe.duration_minutes ? ` · ${detalhe.duration_minutes} min` : ""}
                  </p>
                </div>
                {detalhe.appointment_type && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Tipo</p>
                    <p className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${APPOINTMENT_TYPE_COLORS[detalhe.appointment_type].ponto}`} />
                      {APPOINTMENT_TYPE_LABELS[detalhe.appointment_type]}
                    </p>
                  </div>
                )}
                {detalhe.professional?.name && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Médico</p>
                    <p>{detalhe.professional.name}</p>
                  </div>
                )}
                {detalhe.patient?.phone && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Telefone</p>
                    <p>{detalhe.patient.phone}</p>
                  </div>
                )}
                {detalhe.body && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Observações</p>
                    <p className="whitespace-pre-wrap">{detalhe.body}</p>
                  </div>
                )}

                {remarcando ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="text-xs font-medium">Novo horário</p>
                    <Input
                      type="datetime-local"
                      value={novaData}
                      onChange={(e) => setNovaData(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => remarcar(detalhe.id)} disabled={!novaData || salvandoRemarcacao}>
                        {salvandoRemarcacao ? "Salvando…" : "Confirmar novo horário"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRemarcando(false)}>Cancelar</Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      A consulta volta para "Agendada" no novo horário.
                    </p>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setNovaData(detalhe.due_date ? toInputLocal(new Date(detalhe.due_date)) : "");
                      setRemarcando(true);
                    }}
                  >
                    <CalendarClock className="mr-1 h-3.5 w-3.5" /> Remarcar
                  </Button>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => updateStatus(detalhe.id, "confirmed")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Confirmar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(detalhe.id, "attended")}>
                    <ListChecks className="mr-1 h-3.5 w-3.5" /> Atendida
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(detalhe.id, "no_show")}>
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" /> Faltou
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => updateStatus(detalhe.id, "cancelled")}>
                    <XCircle className="mr-1 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </div>

                {detalhe.patient?.id && (
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => { setDrawerPatientId(detalhe.patient!.id); setDetalheId(null); }}
                  >
                    Abrir ficha do paciente
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AppointmentCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultPatientId={defaultPatient}
        onCreated={() => void fetchAgenda()}
      />

      <BloqueioCreateModal
        open={bloqueioOpen}
        onOpenChange={setBloqueioOpen}
        professionals={professionals}
        quandoInicial={bloqueioQuando}
        onCreated={() => void fetchAgenda()}
      />

      <PatientDrawer
        patientId={drawerPatientId}
        open={drawerPatientId !== null}
        onOpenChange={(o) => { if (!o) setDrawerPatientId(null); }}
        onUpdated={() => void fetchAgenda()}
      />
    </div>
  );
}
