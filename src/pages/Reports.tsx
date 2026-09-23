import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  CalendarCheck, CalendarX, UserPlus, DollarSign, Download, Stethoscope,
  Users, Activity as ActivityIcon, BarChart3, AlertTriangle, Wallet,
} from "lucide-react";
import {
  APPOINTMENT_STATUS_LABELS, APPOINTMENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, BRL,
  type AppointmentStatus,
} from "@/components/health/types";

// ── Types ─────────────────────────────────────
type Appointment = {
  id: string; title: string; due_date: string | null; completed_at: string | null;
  appointment_status: AppointmentStatus | null;
  appointment_type: string | null;
  duration_minutes: number | null;
  contact_id: string | null;
  professional_id: string | null;
  created_at: string | null;
};

type Payment = {
  id: string; patient_id: string; amount: number; status: string;
  payment_method: string; procedure_name: string;
  paid_at: string | null; created_at: string;
};

type Patient = {
  id: string; first_name: string; last_name: string | null;
  status: string; no_show_count: number; created_at: string;
  assigned_professional_id: string | null;
};

type Professional = {
  id: string; name: string; specialty: string | null; is_active: boolean;
};

type PeriodFilter = "this_month" | "last_month" | "this_quarter" | "this_year" | "all";

// ── Helpers ───────────────────────────────────
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

const CHART_COLORS = [
  "hsl(217, 91%, 60%)", "hsl(142, 76%, 36%)", "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)", "hsl(262, 83%, 58%)", "hsl(190, 95%, 39%)",
  "hsl(326, 78%, 55%)", "hsl(25, 95%, 53%)",
];

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  color: "hsl(var(--popover-foreground))",
  fontSize: 11,
};

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function getPeriodRange(p: PeriodFilter): { start: Date | null; end: Date | null } {
  const now = new Date();
  switch (p) {
    case "this_month": return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case "last_month": return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59) };
    case "this_quarter": return { start: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1), end: null };
    case "this_year": return { start: new Date(now.getFullYear(), 0, 1), end: null };
    default: return { start: null, end: null };
  }
}

function inRange(dateStr: string | null, r: { start: Date | null; end: Date | null }): boolean {
  if (!dateStr) return !r.start;
  const d = new Date(dateStr);
  if (r.start && d < r.start) return false;
  if (r.end && d > r.end) return false;
  return true;
}

function downloadCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════
export default function Reports() {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<PeriodFilter>("this_month");
  const [professionalFilter, setProfessionalFilter] = useState<string>("all");

  const fetchAll = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [apptRes, payRes, patRes, profRes] = await Promise.all([
        (supabase as any).from("activities")
          .select("id,title,due_date,completed_at,appointment_status,appointment_type,duration_minutes,contact_id,professional_id,created_at")
          .eq("org_id", orgId)
          .not("appointment_status", "is", null)
          .limit(2000),
        (supabase as any).from("payments")
          .select("id,patient_id,amount,status,payment_method,procedure_name,paid_at,created_at")
          .eq("org_id", orgId)
          .limit(2000),
        (supabase as any).from("patients")
          .select("id,first_name,last_name,status,no_show_count,created_at,assigned_professional_id")
          .eq("org_id", orgId)
          .limit(2000),
        (supabase as any).from("professionals")
          .select("id,name,specialty,is_active")
          .eq("org_id", orgId),
      ]);
      setAppointments((apptRes.data || []) as Appointment[]);
      setPayments(((payRes.data || []) as any[]).map(p => ({ ...p, amount: Number(p.amount) })));
      setPatients((patRes.data || []) as Patient[]);
      setProfessionals((profRes.data || []) as Professional[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar relatórios", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const range = useMemo(() => getPeriodRange(period), [period]);

  const filteredAppts = useMemo(() => {
    return appointments.filter(a => {
      if (professionalFilter !== "all" && a.professional_id !== professionalFilter) return false;
      return inRange(a.due_date || a.created_at, range);
    });
  }, [appointments, professionalFilter, range]);

  const filteredPayments = useMemo(() => {
    return payments.filter(p => inRange(p.paid_at || p.created_at, range));
  }, [payments, range]);

  const profMap = useMemo(() => {
    const m = new Map<string, Professional>();
    professionals.forEach(p => m.set(p.id, p));
    return m;
  }, [professionals]);

  const patMap = useMemo(() => {
    const m = new Map<string, Patient>();
    patients.forEach(p => m.set(p.id, p));
    return m;
  }, [patients]);

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Indicadores da clínica: agenda, profissionais, pacientes e financeiro.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">Este mês</SelectItem>
              <SelectItem value="last_month">Mês passado</SelectItem>
              <SelectItem value="this_quarter">Este trimestre</SelectItem>
              <SelectItem value="this_year">Este ano</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={professionalFilter} onValueChange={setProfessionalFilter}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os profissionais</SelectItem>
              {professionals.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" />Visão geral</TabsTrigger>
            <TabsTrigger value="agenda" className="text-xs gap-1"><CalendarCheck className="h-3.5 w-3.5" />Agenda</TabsTrigger>
            <TabsTrigger value="professionals" className="text-xs gap-1"><Stethoscope className="h-3.5 w-3.5" />Profissionais</TabsTrigger>
            <TabsTrigger value="patients" className="text-xs gap-1"><Users className="h-3.5 w-3.5" />Pacientes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewReport appts={filteredAppts} payments={filteredPayments} patients={patients} range={range} />
          </TabsContent>
          <TabsContent value="agenda">
            <AgendaReport appts={filteredAppts} />
          </TabsContent>
          <TabsContent value="professionals">
            <ProfessionalsReport appts={filteredAppts} payments={filteredPayments} professionals={professionals} patMap={patMap} />
          </TabsContent>
          <TabsContent value="patients">
            <PatientsReport patients={patients} appts={appointments} payments={payments} range={range} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: Visão geral
// ─────────────────────────────────────────────
function OverviewReport({ appts, payments, patients, range }: {
  appts: Appointment[]; payments: Payment[]; patients: Patient[];
  range: { start: Date | null; end: Date | null };
}) {
  const attended = appts.filter(a => a.appointment_status === "attended").length;
  const noShow = appts.filter(a => a.appointment_status === "no_show").length;
  const cancelled = appts.filter(a => a.appointment_status === "cancelled").length;
  const scheduled = appts.filter(a => a.appointment_status === "scheduled" || a.appointment_status === "confirmed").length;
  const total = appts.length;
  const attendanceRate = pct(attended, attended + noShow);
  const noShowRate = pct(noShow, attended + noShow);

  const revenue = payments.filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0);
  const pendingRevenue = payments.filter(p => p.status === "pending").reduce((s, p) => s + p.amount, 0);
  const avgTicket = attended > 0 ? revenue / attended : 0;

  const newPatients = patients.filter(p => inRange(p.created_at, range)).length;

  // Trend by month (last 6)
  const trend = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; consultas: number; receita: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: MONTHS_PT[d.getMonth()],
        consultas: appts.filter(a => {
          const dt = a.due_date ? new Date(a.due_date) : null;
          return dt && dt >= d && dt < next && a.appointment_status === "attended";
        }).length,
        receita: payments.filter(p => {
          const dt = p.paid_at ? new Date(p.paid_at) : null;
          return dt && dt >= d && dt < next && p.status === "paid";
        }).reduce((s, p) => s + p.amount, 0),
      });
    }
    return buckets;
  }, [appts, payments]);

  const kpis = [
    { label: "Consultas no período", value: total, icon: CalendarCheck, color: "text-primary", sub: `${scheduled} futuras` },
    { label: "Atendidas", value: attended, icon: CalendarCheck, color: "text-success", sub: `${attendanceRate}% comparecimento` },
    { label: "No-show", value: noShow, icon: CalendarX, color: "text-amber-600", sub: `${noShowRate}% taxa` },
    { label: "Canceladas", value: cancelled, icon: CalendarX, color: "text-rose-600" },
    { label: "Receita recebida", value: BRL.format(revenue), icon: DollarSign, color: "text-success", sub: `Pendente: ${BRL.format(pendingRevenue)}` },
    { label: "Ticket médio", value: BRL.format(avgTicket), icon: Wallet, color: "text-primary" },
    { label: "Novos pacientes", value: newPatients, icon: UserPlus, color: "text-primary" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${k.color}`} />
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</p>
                </div>
                <p className="text-xl font-bold leading-tight">{k.value}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consultas atendidas (últimos 6 meses)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="consultas" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Receita recebida (últimos 6 meses)</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => `R$${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => BRL.format(Number(v))} />
                <Line type="monotone" dataKey="receita" stroke={CHART_COLORS[1]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: Agenda
// ─────────────────────────────────────────────
function AgendaReport({ appts }: { appts: Appointment[] }) {
  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    appts.forEach(a => {
      const k = a.appointment_status || "scheduled";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([k, v]) => ({ name: APPOINTMENT_STATUS_LABELS[k as AppointmentStatus] ?? k, value: v }));
  }, [appts]);

  const byType = useMemo(() => {
    const map: Record<string, number> = {};
    appts.forEach(a => {
      const k = a.appointment_type || "consulta";
      map[k] = (map[k] || 0) + 1;
    });
    return Object.entries(map).map(([k, v]) => ({
      name: APPOINTMENT_TYPE_LABELS[k as keyof typeof APPOINTMENT_TYPE_LABELS] ?? k,
      value: v,
    })).sort((a, b) => b.value - a.value);
  }, [appts]);

  const byWeekday = useMemo(() => {
    const wd = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const buckets = wd.map(d => ({ dia: d, consultas: 0 }));
    appts.forEach(a => {
      const dt = a.due_date ? new Date(a.due_date) : null;
      if (dt) buckets[dt.getDay()].consultas += 1;
    });
    return buckets;
  }, [appts]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consultas por status</CardTitle></CardHeader>
          <CardContent className="h-64">
            {byStatus.length === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={(e: any) => `${e.value}`}>
                    {byStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Consultas por tipo</CardTitle></CardHeader>
          <CardContent className="h-64">
            {byType.length === 0 ? (
              <div className="h-full grid place-items-center text-xs text-muted-foreground">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Volume por dia da semana</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byWeekday}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="dia" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="consultas" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: Profissionais
// ─────────────────────────────────────────────
function ProfessionalsReport({ appts, payments, professionals, patMap }: {
  appts: Appointment[]; payments: Payment[]; professionals: Professional[];
  patMap: Map<string, Patient>;
}) {
  const rows = useMemo(() => {
    return professionals.map(p => {
      const mine = appts.filter(a => a.professional_id === p.id);
      const attended = mine.filter(a => a.appointment_status === "attended").length;
      const noShow = mine.filter(a => a.appointment_status === "no_show").length;
      const cancelled = mine.filter(a => a.appointment_status === "cancelled").length;
      const upcoming = mine.filter(a => a.appointment_status === "scheduled" || a.appointment_status === "confirmed").length;
      // revenue: payments for patients of attended appts by this prof (proxy: payments tied to activity_id when present is hard; use patient assignment heuristic)
      const myPatientIds = new Set(mine.map(a => a.contact_id).filter(Boolean) as string[]);
      const revenue = payments
        .filter(pay => pay.status === "paid" && myPatientIds.has(pay.patient_id))
        .reduce((s, pay) => s + pay.amount, 0);
      return {
        id: p.id,
        name: p.name,
        specialty: p.specialty || "—",
        total: mine.length,
        attended,
        noShow,
        cancelled,
        upcoming,
        attendanceRate: pct(attended, attended + noShow),
        revenue,
      };
    }).sort((a, b) => b.attended - a.attended);
  }, [appts, payments, professionals]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Produtividade por profissional</CardTitle>
          <Button variant="outline" size="sm" className="h-7 text-[10px]"
            onClick={() => downloadCSV(rows.map(r => ({
              Profissional: r.name, Especialidade: r.specialty, Total: r.total, Atendidas: r.attended,
              "No-show": r.noShow, Canceladas: r.cancelled, "Futuras": r.upcoming,
              "Taxa comparecimento (%)": r.attendanceRate, "Receita (R$)": r.revenue,
            })), "profissionais")}>
            <Download className="mr-1 h-3 w-3" />CSV
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">Nenhum profissional cadastrado</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Profissional</TableHead>
                  <TableHead className="text-[10px]">Especialidade</TableHead>
                  <TableHead className="text-[10px] text-right">Total</TableHead>
                  <TableHead className="text-[10px] text-right">Atendidas</TableHead>
                  <TableHead className="text-[10px] text-right">No-show</TableHead>
                  <TableHead className="text-[10px] text-right">Canceladas</TableHead>
                  <TableHead className="text-[10px] text-right">Futuras</TableHead>
                  <TableHead className="text-[10px] text-right">Comparecimento</TableHead>
                  <TableHead className="text-[10px] text-right">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-medium">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.specialty}</TableCell>
                    <TableCell className="text-xs text-right">{r.total}</TableCell>
                    <TableCell className="text-xs text-right text-success">{r.attended}</TableCell>
                    <TableCell className="text-xs text-right text-amber-600">{r.noShow}</TableCell>
                    <TableCell className="text-xs text-right text-rose-600">{r.cancelled}</TableCell>
                    <TableCell className="text-xs text-right">{r.upcoming}</TableCell>
                    <TableCell className="text-xs text-right">
                      <Badge variant="outline" className="text-[10px]">{r.attendanceRate}%</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">{BRL.format(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────
// TAB: Pacientes
// ─────────────────────────────────────────────
function PatientsReport({ patients, appts, payments, range }: {
  patients: Patient[]; appts: Appointment[]; payments: Payment[];
  range: { start: Date | null; end: Date | null };
}) {
  const newPatients = patients.filter(p => inRange(p.created_at, range));
  const active = patients.filter(p => p.status === "active").length;
  const inactive = patients.filter(p => p.status === "inactive").length;
  const atRisk = patients.filter(p => p.no_show_count >= 2).sort((a, b) => b.no_show_count - a.no_show_count).slice(0, 10);

  // Top by revenue
  const topRevenue = useMemo(() => {
    const map = new Map<string, number>();
    payments.filter(p => p.status === "paid").forEach(p => {
      map.set(p.patient_id, (map.get(p.patient_id) || 0) + p.amount);
    });
    const arr = patients.map(p => ({
      patient: p,
      revenue: map.get(p.id) || 0,
    })).filter(x => x.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    return arr;
  }, [patients, payments]);

  // New patients by month
  const newByMonth = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; novos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: MONTHS_PT[d.getMonth()],
        novos: patients.filter(p => {
          const dt = new Date(p.created_at);
          return dt >= d && dt < next;
        }).length,
      });
    }
    return buckets;
  }, [patients]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold">{patients.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Total</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-success">{active}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Ativos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-muted-foreground">{inactive}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Inativos</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{newPatients.length}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Novos no período</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Novos pacientes (últimos 6 meses)</CardTitle></CardHeader>
        <CardContent className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={newByMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="novos" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top pacientes por receita</CardTitle></CardHeader>
          <CardContent>
            {topRevenue.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Sem pagamentos registrados</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Paciente</TableHead>
                    <TableHead className="text-[10px] text-right">Receita</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topRevenue.map(r => (
                    <TableRow key={r.patient.id}>
                      <TableCell className="text-xs">{r.patient.first_name} {r.patient.last_name ?? ""}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{BRL.format(r.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Pacientes em risco (no-show ≥ 2)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {atRisk.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">Nenhum paciente em risco</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">Paciente</TableHead>
                    <TableHead className="text-[10px] text-right">Faltas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {atRisk.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{p.first_name} {p.last_name ?? ""}</TableCell>
                      <TableCell className="text-xs text-right">
                        <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">{p.no_show_count}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

