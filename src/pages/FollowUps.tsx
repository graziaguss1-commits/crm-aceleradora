import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/crm/EmptyState";
import { CalendarClock, Check, ExternalLink, Phone, X } from "lucide-react";
import { Link } from "react-router-dom";
import { TemperaturaBadge } from "@/components/leads/LeadCard";

type Row = {
  id: string;
  data_agendada: string;
  canal: string;
  observacao: string | null;
  status: string;
  deal_id: string | null;
  contact_id: string | null;
  contacts: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    temperatura: string | null;
  } | null;
};

type Bucket = "atrasados" | "hoje" | "semana" | "proximos";

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "atrasados", label: "Atrasados", tone: "text-destructive" },
  { key: "hoje", label: "Hoje", tone: "text-amber-600 dark:text-amber-400" },
  { key: "semana", label: "Esta semana", tone: "text-sky-600 dark:text-sky-400" },
  { key: "proximos", label: "Próximos", tone: "text-muted-foreground" },
];

function bucketOf(iso: string): Bucket {
  const now = new Date();
  const d = new Date(iso);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const endWeek = new Date(endToday.getTime() + 6 * 86400000);
  if (d.getTime() < now.getTime()) return "atrasados";
  if (d <= endToday) return "hoje";
  if (d <= endWeek) return "semana";
  return "proximos";
}

export default function FollowUps() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [doneId, setDoneId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["follow-ups-agenda", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase
        .from("follow_ups")
        .select("id,data_agendada,canal,observacao,status,deal_id,contact_id,contacts(first_name,last_name,phone,temperatura)")
        .eq("org_id", orgId!)
        .eq("status", "pendente")
        .order("data_agendada")
        .limit(500);
      return (data ?? []) as unknown as Row[];
    },
  });

  const grouped = useMemo(() => {
    const map: Record<Bucket, Row[]> = { atrasados: [], hoje: [], semana: [], proximos: [] };
    for (const r of rows) map[bucketOf(r.data_agendada)].push(r);
    return map;
  }, [rows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["follow-ups-agenda"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
  };

  const concluir = async (id: string) => {
    const { error } = await supabase
      .from("follow_ups")
      .update({ status: "realizado", realizado_em: new Date().toISOString(), resultado: resultado || null })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setDoneId(null);
    setResultado("");
    toast({ title: "Follow-up realizado" });
    refresh();
  };

  const cancelar = async (id: string) => {
    await supabase.from("follow_ups").update({ status: "cancelado" }).eq("id", id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <CalendarClock className="h-6 w-6 text-primary" /> Agenda de Follow-ups
        </h1>
        <p className="text-sm text-muted-foreground">
          Contatos pendentes organizados por urgência.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/40" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6 text-muted-foreground" />}
          title="Nenhum follow-up pendente"
          description="Agende contatos a partir do detalhe de cada lead no pipeline."
        />
      ) : (
        <div className="space-y-8">
          {BUCKETS.map(({ key, label, tone }) => {
            const items = grouped[key];
            if (!items.length) return null;
            return (
              <section key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-semibold uppercase tracking-wide ${tone}`}>{label}</h2>
                  <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((r) => {
                    const name = [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" ") || "Lead sem nome";
                    return (
                      <Card key={r.id} className={`p-4 ${key === "atrasados" ? "border-destructive/40" : ""}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-1">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              {name}
                              <TemperaturaBadge value={r.contacts?.temperatura} />
                            </p>
                            <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className={key === "atrasados" ? "font-semibold text-destructive" : ""}>
                                {new Date(r.data_agendada).toLocaleString("pt-BR")}
                              </span>
                              <span>{r.canal}</span>
                              {r.contacts?.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" /> {r.contacts.phone}
                                </span>
                              )}
                            </p>
                            {r.observacao && <p className="text-sm">{r.observacao}</p>}
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => setDoneId(r.id)}>
                              <Check className="h-3.5 w-3.5" /> Realizado
                            </Button>
                            {r.deal_id && (
                              <Button asChild size="sm" variant="outline" className="gap-1">
                                <Link to={`/pipeline?lead=${r.deal_id}`}>
                                  <ExternalLink className="h-3.5 w-3.5" /> Abrir lead
                                </Link>
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => cancelar(r.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {doneId === r.id && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            <Textarea
                              rows={2}
                              placeholder="Qual foi o resultado do contato?"
                              value={resultado}
                              onChange={(e) => setResultado(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => concluir(r.id)}>Confirmar</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDoneId(null); setResultado(""); }}>
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
