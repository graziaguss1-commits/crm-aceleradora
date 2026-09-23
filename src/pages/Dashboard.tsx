import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { DIAS_SEM_RETORNO_PADRAO, getDiasSemRetorno } from "@/lib/orgSettings";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend, CartesianGrid,
} from "recharts";
import { Calendar, CheckCircle2, AlertTriangle, DollarSign, ArrowRight, Check } from "lucide-react";
import {
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_STATUS_BADGE, AppointmentStatus, BRL, fullName,
} from "@/components/health/types";

interface AppointmentLite {
  id: string;
  title: string;
  due_date: string | null;
  appointment_status: AppointmentStatus;
  duration_minutes: number | null;
  contact_id: string | null;
  patient_name?: string;
}

interface PaymentLite { id: string; amount: number; status: string; paid_at: string | null; created_at: string }
interface ActivityPending { id: string; title: string; due_date: string | null; type: string | null }
interface OverduePatient { id: string; first_name: string; last_name: string | null; last_appointment: string }
interface RecuperacaoItem {
  id: string;
  title: string;
  due_date: string;
  appointment_status: "cancelled" | "no_show";
  contact_id: string | null;
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "#3b82f6",
  confirmed: "#10b981",
  attended: "#6b7280",
  no_show: "#f59e0b",
  cancelled: "#ef4444",
};

export default function Dashboard() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [todayAppointments, setTodayAppointments] = useState<AppointmentLite[]>([]);
  const [monthAppointments, setMonthAppointments] = useState<AppointmentLite[]>([]);
  const [payments, setPayments] = useState<PaymentLite[]>([]);
  const [pendingActivities, setPendingActivities] = useState<ActivityPending[]>([]);
  const [overduePatients, setOverduePatients] = useState<OverduePatient[]>([]);
  const [diasSemRetorno, setDiasSemRetorno] = useState(DIAS_SEM_RETORNO_PADRAO);
  const [recuperacao, setRecuperacao] = useState<RecuperacaoItem[]>([]);
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);

  const marcarResolvido = async (id: string) => {
    // Some da lista na hora; o refetch confirma.
    setRecuperacao((atual) => atual.filter((r) => r.id !== id));
    const { error } = await (supabase as any)
      .from("activities")
      .update({ resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao marcar", description: error.message, variant: "destructive" });
      void fetchDataRef.current?.();
    }
  };

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
      const last14 = new Date(now); last14.setDate(now.getDate() - 13); last14.setHours(0, 0, 0, 0);
      const dias = await getDiasSemRetorno(orgId);
      setDiasSemRetorno(dias);
      const limiteSemRetorno = new Date(now); limiteSemRetorno.setDate(now.getDate() - dias);

      const [todayRes, monthRes, paymentsRes, pendingRes, attendedRes] = await Promise.all([
        (supabase as any)
          .from("activities")
          .select("id,title,due_date,appointment_status,duration_minutes,contact_id")
          .eq("org_id", orgId)
          .not("appointment_status", "is", null)
          .gte("due_date", todayStart.toISOString())
          .lte("due_date", todayEnd.toISOString())
          .order("due_date", { ascending: true }),
        (supabase as any)
          .from("activities")
          .select("id,due_date,appointment_status,duration_minutes,contact_id,title")
          .eq("org_id", orgId)
          .not("appointment_status", "is", null)
          .gte("due_date", last14.toISOString())
          .lte("due_date", monthEnd.toISOString())
          .order("due_date", { ascending: true }),
        (supabase as any)
          .from("payments")
          .select("id,amount,status,paid_at,created_at")
          .eq("org_id", orgId)
          .gte("created_at", monthStart.toISOString()),
        (supabase as any)
          .from("activities")
          .select("id,title,due_date,type")
          .eq("org_id", orgId)
          .is("appointment_status", null)
          .is("completed_at", null)
          .order("due_date", { ascending: true })
          .limit(10),
        (supabase as any)
          .from("activities")
          .select("contact_id,due_date,appointment_status")
          .eq("org_id", orgId)
          .eq("appointment_status", "attended")
          .order("due_date", { ascending: false })
          .limit(500),
      ]);

      const today = (todayRes.data ?? []) as AppointmentLite[];
      const month = (monthRes.data ?? []) as AppointmentLite[];
      const pays = (paymentsRes.data ?? []) as PaymentLite[];
      const pending = (pendingRes.data ?? []) as ActivityPending[];

      const allPatientIds = Array.from(new Set([
        ...today.map((a) => a.contact_id),
        ...month.map((a) => a.contact_id),
      ].filter(Boolean) as string[]));
      let pMap = new Map<string, string>();
      if (allPatientIds.length) {
        const { data: pats } = await (supabase as any)
          .from("patients")
          .select("id,first_name,last_name")
          .in("id", allPatientIds);
        pMap = new Map((pats ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name ?? ""}`.trim()]));
      }
      const enrich = (a: AppointmentLite) => ({ ...a, patient_name: a.contact_id ? pMap.get(a.contact_id) : undefined });

      setTodayAppointments(today.map(enrich));
      setMonthAppointments(month.map(enrich));
      setPayments(pays);
      setPendingActivities(pending);

      // Faltas e cancelamentos ainda nao tratados pela recepcao.
      const { data: recData } = await (supabase as any)
        .from("activities")
        .select("id,title,due_date,appointment_status,contact_id")
        .eq("org_id", orgId)
        .in("appointment_status", ["cancelled", "no_show"])
        .is("resolvido_em", null)
        .order("due_date", { ascending: false })
        .limit(20);
      setRecuperacao((recData ?? []) as RecuperacaoItem[]);

      // Pacientes sem retorno: ultima consulta atendida alem do prazo configurado
      // em Configuracoes -> Geral, e sem retorno ja marcado.
      const lastAttendedByPatient = new Map<string, string>();
      for (const a of (attendedRes.data ?? []) as any[]) {
        if (!a.contact_id || !a.due_date) continue;
        const existing = lastAttendedByPatient.get(a.contact_id);
        if (!existing || new Date(existing) < new Date(a.due_date)) {
          lastAttendedByPatient.set(a.contact_id, a.due_date);
        }
      }
      const overdueIds = Array.from(lastAttendedByPatient.entries())
        .filter(([, last]) => new Date(last) < limiteSemRetorno)
        .slice(0, 50)
        .map(([id]) => id);
      if (overdueIds.length > 0) {
        const { data: futureApps } = await (supabase as any)
          .from("activities")
          .select("contact_id")
          .eq("org_id", orgId)
          .in("contact_id", overdueIds)
          .in("appointment_status", ["scheduled", "confirmed"])
          .gte("due_date", now.toISOString());
        const withFuture = new Set((futureApps ?? []).map((a: any) => a.contact_id));
        const filtered = overdueIds.filter((id) => !withFuture.has(id));
        if (filtered.length) {
          const { data: patientsData } = await (supabase as any)
            .from("patients")
            .select("id,first_name,last_name")
            .in("id", filtered);
          const list: OverduePatient[] = (patientsData ?? []).map((p: any) => ({
            id: p.id,
            first_name: p.first_name,
            last_name: p.last_name,
            last_appointment: lastAttendedByPatient.get(p.id) ?? "",
          }));
          list.sort((a, b) => (a.last_appointment < b.last_appointment ? -1 : 1));
          setOverduePatients(list.slice(0, 10));
        } else {
          setOverduePatients([]);
        }
      } else {
        setOverduePatients([]);
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar dashboard", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { fetchDataRef.current = fetchData; void fetchData(); }, [fetchData]);

  const kpis = useMemo(() => {
    const todayCount = todayAppointments.length;
    const confirmedToday = todayAppointments.filter((a) => a.appointment_status === "confirmed").length;
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthOnly = monthAppointments.filter((a) => a.due_date && new Date(a.due_date) >= monthStart);
    const monthTotal = monthOnly.length;
    const monthNoShow = monthOnly.filter((a) => a.appointment_status === "no_show").length;
    const noShowPct = monthTotal > 0 ? Math.round((monthNoShow / monthTotal) * 100) : 0;
    const revenue = payments
      .filter((p) => p.status === "paid")
      .reduce((acc, p) => acc + Number(p.amount), 0);
    return { todayCount, confirmedToday, noShowPct, revenue };
  }, [todayAppointments, monthAppointments, payments]);

  const bars14 = useMemo(() => {
    const map = new Map<string, any>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i); d.setHours(0, 0, 0, 0);
      const k = d.toISOString().slice(0, 10);
      map.set(k, { day: k.slice(5), scheduled: 0, confirmed: 0, attended: 0, no_show: 0, cancelled: 0 });
    }
    for (const a of monthAppointments) {
      if (!a.due_date) continue;
      const k = new Date(a.due_date).toISOString().slice(0, 10);
      const entry = map.get(k);
      if (entry && a.appointment_status in entry) entry[a.appointment_status] += 1;
    }
    return Array.from(map.values());
  }, [monthAppointments]);

  const pieData = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const counts: Record<AppointmentStatus, number> = {
      scheduled: 0, confirmed: 0, attended: 0, no_show: 0, cancelled: 0,
    };
    for (const a of monthAppointments) {
      if (!a.due_date || new Date(a.due_date) < monthStart) continue;
      counts[a.appointment_status] = (counts[a.appointment_status] ?? 0) + 1;
    }
    return (Object.keys(counts) as AppointmentStatus[])
      .filter((k) => counts[k] > 0)
      .map((k) => ({ name: APPOINTMENT_STATUS_LABELS[k], value: counts[k], status: k }));
  }, [monthAppointments]);

  const revLine = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${String(d).padStart(2, "0")}`;
      map.set(key, 0);
    }
    for (const p of payments) {
      if (p.status !== "paid" || !p.paid_at) continue;
      const d = new Date(p.paid_at);
      if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
      const key = String(d.getDate()).padStart(2, "0");
      map.set(key, (map.get(key) ?? 0) + Number(p.amount));
    }
    return Array.from(map.entries()).map(([day, value]) => ({ day, value }));
  }, [payments]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão consolidada da clínica.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Consultas hoje</p>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold">{kpis.todayCount}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Confirmadas hoje</p>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold">{kpis.confirmedToday}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Taxa de no-show (mês)</p>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold">{kpis.noShowPct}%</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Receita do mês</p>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-2xl font-semibold">{BRL.format(kpis.revenue)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Consultas por dia (últimos 14 dias)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars14}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar stackId="a" dataKey="scheduled" fill={STATUS_COLORS.scheduled} name="Agendada" />
                <Bar stackId="a" dataKey="confirmed" fill={STATUS_COLORS.confirmed} name="Confirmada" />
                <Bar stackId="a" dataKey="attended" fill={STATUS_COLORS.attended} name="Atendida" />
                <Bar stackId="a" dataKey="no_show" fill={STATUS_COLORS.no_show} name="No-show" />
                <Bar stackId="a" dataKey="cancelled" fill={STATUS_COLORS.cancelled} name="Cancelada" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold">Status das consultas (mês)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={70} innerRadius={40} paddingAngle={2}>
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={STATUS_COLORS[d.status as AppointmentStatus]} />
                  ))}
                </Pie>
                <ChartTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Receita diária (mês atual)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revLine}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${v}`} />
              <ChartTooltip formatter={(v: number) => BRL.format(Number(v))} />
              <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Próximas consultas hoje</h3>
            <Link to="/agenda" className="text-xs text-primary hover:underline">Ver agenda</Link>
          </div>
          {todayAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma consulta hoje.</p>
          ) : (
            <ul className="space-y-2">
              {todayAppointments.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.patient_name ?? a.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.due_date ? new Date(a.due_date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      {a.duration_minutes && ` · ${a.duration_minutes} min`}
                    </p>
                  </div>
                  <Badge className={APPOINTMENT_STATUS_BADGE[a.appointment_status] ?? ""}>
                    {APPOINTMENT_STATUS_LABELS[a.appointment_status] ?? a.appointment_status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Atividades pendentes</h3>
            <Link to="/activities" className="text-xs text-primary hover:underline">Ver tudo</Link>
          </div>
          {pendingActivities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <ul className="space-y-2">
              {pendingActivities.slice(0, 8).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.type ?? "Tarefa"} · {a.due_date ? new Date(a.due_date).toLocaleDateString("pt-BR") : "sem prazo"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Sem retorno há {diasSemRetorno}+ dias</h3>
            <Link to="/patients" className="text-xs text-primary hover:underline">Ver pacientes</Link>
          </div>
          {overduePatients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tudo em dia.</p>
          ) : (
            <ul className="space-y-2">
              {overduePatients.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{fullName(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      Última consulta {new Date(p.last_appointment).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/agenda?patient=${p.id}`}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Faltas e cancelamentos a recuperar</h3>
            <Link to="/agenda" className="text-xs text-primary hover:underline">Ver agenda</Link>
          </div>
          {recuperacao.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pendente.</p>
          ) : (
            <ul className="space-y-2">
              {recuperacao.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.appointment_status === "no_show" ? "Faltou" : "Cancelou"} ·{" "}
                      {new Date(r.due_date).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => marcarResolvido(r.id)}>
                    <Check className="mr-1 h-3.5 w-3.5" /> OK
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
