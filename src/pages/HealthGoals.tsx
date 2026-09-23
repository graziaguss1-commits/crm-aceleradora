import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Target, Plus } from "lucide-react";
import { EmptyState } from "@/components/crm/EmptyState";

interface Goal {
  id: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  period_month: number;
  period_year: number;
  user_id: string | null;
}

const GOAL_TYPES: Record<string, string> = {
  appointments: "Consultas atendidas",
  revenue: "Receita",
  new_patients: "Novos pacientes",
  no_show_reduction: "Redução de no-show",
};

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function HealthGoals() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [goalType, setGoalType] = useState("appointments");
  const [target, setTarget] = useState<string>("");
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [year, setYear] = useState<number>(now.getFullYear());

  const fetchGoals = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("health_goals")
        .select("id,goal_type,target_value,current_value,period_month,period_year,user_id")
        .eq("org_id", orgId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      setGoals((data ?? []) as Goal[]);
    } catch (err: any) {
      toast({ title: "Erro ao carregar metas", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => { void fetchGoals(); }, [fetchGoals]);

  const handleSave = async () => {
    if (!orgId) return;
    const t = Number(target.replace(",", "."));
    if (!Number.isFinite(t) || t <= 0) {
      toast({ title: "Meta inválida", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("health_goals").insert({
        org_id: orgId,
        goal_type: goalType,
        target_value: t,
        current_value: 0,
        period_month: month,
        period_year: year,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast({ title: "Meta criada" });
      setOpen(false);
      setTarget("");
      void fetchGoals();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sorted = useMemo(() => goals, [goals]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Metas</h1>
          <p className="text-sm text-muted-foreground">Acompanhe metas mensais da clínica.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nova meta
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="h-7 w-7 text-muted-foreground" />}
            title="Nenhuma meta definida"
            description="Defina metas mensais para consultas, receita ou novos pacientes."
            actionLabel="Criar primeira meta"
            onAction={() => setOpen(true)}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((g) => {
            const pct = g.target_value > 0
              ? Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100))
              : 0;
            return (
              <Card key={g.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">
                      {MONTHS[g.period_month - 1]}/{g.period_year}
                    </p>
                    <p className="font-semibold">{GOAL_TYPES[g.goal_type] ?? g.goal_type}</p>
                  </div>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </div>
                <Progress value={pct} />
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-mono">{Number(g.current_value)} / {Number(g.target_value)}</span>
                  <span className="text-muted-foreground">{pct}%</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova meta</DialogTitle>
            <DialogDescription>Defina meta mensal para um indicador da clínica.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GOAL_TYPES).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mês</Label>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (<SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Ano</Label>
                <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Meta (valor numérico)</Label>
              <Input
                inputMode="decimal" value={target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="Ex: 120"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando…" : "Criar meta"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
