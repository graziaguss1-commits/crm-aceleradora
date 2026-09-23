import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Plus, Search, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/crm/EmptyState";
import { TableSkeleton } from "@/components/crm/TableSkeleton";
import { PatientCreateModal } from "@/components/health/PatientCreateModal";
import { PatientDrawer } from "@/components/health/PatientDrawer";
import { Patient, fullName, formatPhone, maskCpf } from "@/components/health/types";

const PAGE_SIZE = 25;

interface PatientRow extends Patient {
  last_appointment?: string | null;
  next_appointment?: string | null;
}

export default function Patients() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [drawerPatientId, setDrawerPatientId] = useState<string | null>(null);

  const fetchOwners = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("professionals")
      .select("id,name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("name");
    setOwners((data ?? []) as { id: string; name: string }[]);
  }, [orgId]);

  const fetchPatients = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("patients")
        .select("*", { count: "exact" })
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (ownerFilter !== "all") q = q.eq("assigned_professional_id", ownerFilter);
      if (search.trim()) {
        const term = `%${search.trim()}%`;
        q = q.or(
          `first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term},cpf.ilike.${term}`,
        );
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;

      setRows((data ?? []) as PatientRow[]);
      setTotal(count ?? 0);

      // Enrich with last/next appointment (best-effort, single batch)
      const ids = (data ?? []).map((p: any) => p.id);
      if (ids.length > 0) {
        const { data: apps } = await (supabase as any)
          .from("activities")
          .select("contact_id,due_date,appointment_status")
          .in("contact_id", ids)
          .not("appointment_status", "is", null);
        if (apps) {
          const now = new Date();
          const lastByPatient = new Map<string, string>();
          const nextByPatient = new Map<string, string>();
          for (const a of apps) {
            if (!a.due_date || !a.contact_id) continue;
            const date = new Date(a.due_date);
            if (date <= now) {
              const prev = lastByPatient.get(a.contact_id);
              if (!prev || new Date(prev) < date) lastByPatient.set(a.contact_id, a.due_date);
            } else {
              const prev = nextByPatient.get(a.contact_id);
              if (!prev || new Date(prev) > date) nextByPatient.set(a.contact_id, a.due_date);
            }
          }
          setRows((curr) =>
            curr.map((p) => ({
              ...p,
              last_appointment: lastByPatient.get(p.id) ?? null,
              next_appointment: nextByPatient.get(p.id) ?? null,
            })),
          );
        }
      }
    } catch (err: any) {
      toast({
        title: "Erro ao carregar pacientes",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [orgId, statusFilter, ownerFilter, search, page, toast]);

  useEffect(() => { void fetchOwners(); }, [fetchOwners]);
  useEffect(() => { void fetchPatients(); }, [fetchPatients]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground">Cadastro e histórico clínico dos pacientes da clínica.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Novo paciente
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar por nome, telefone ou CPF…"
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Médico" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os médicos</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-7 w-7 text-muted-foreground" />}
            title="Nenhum paciente cadastrado ainda"
            description="Cadastre o primeiro paciente para começar a montar a agenda e os prontuários."
            actionLabel="Cadastrar primeiro paciente"
            onAction={() => setCreateOpen(true)}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>CPF</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Convênio</TableHead>
                  <TableHead>Última consulta</TableHead>
                  <TableHead>Próxima consulta</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => setDrawerPatientId(p.id)}
                    className="cursor-pointer hover:bg-accent/40"
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={p.avatar_url ?? undefined} />
                          <AvatarFallback>{p.first_name.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{fullName(p)}</p>
                          {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{maskCpf(p.cpf)}</TableCell>
                    <TableCell className="text-sm">{formatPhone(p.phone)}</TableCell>
                    <TableCell className="text-sm">{p.health_plan ?? "Particular"}</TableCell>
                    <TableCell className="text-sm">
                      {p.last_appointment ? new Date(p.last_appointment).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.next_appointment ? new Date(p.next_appointment).toLocaleDateString("pt-BR") : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.status === "active" ? "default" : "secondary"}>
                        {p.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span className="text-muted-foreground">
                {total} paciente{total === 1 ? "" : "s"} · página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <PatientCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(id) => { void fetchPatients(); setDrawerPatientId(id); }}
      />
      <PatientDrawer
        patientId={drawerPatientId}
        open={drawerPatientId !== null}
        onOpenChange={(o) => { if (!o) setDrawerPatientId(null); }}
        onUpdated={() => void fetchPatients()}
      />
    </div>
  );
}
