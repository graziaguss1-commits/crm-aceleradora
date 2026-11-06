import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, endOfWeek, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/crm/EmptyState";
import {
  CalendarClock, CalendarRange, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, List, ListOrdered,
  MessageCircle, Phone, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { TemperaturaBadge } from "@/components/leads/LeadCard";

type Row = {
  id: string;
  data_agendada: string;
  canal: string;
  observacao: string | null;
  mensagem: string | null;
  status: string;
  resultado: string | null;
  passo_ordem: number | null;
  passo_total: number | null;
  deal_id: string | null;
  contact_id: string | null;
  contacts: { first_name: string | null; last_name: string | null; phone: string | null; temperatura: string | null } | null;
  sequencias_followup: { nome: string } | null;
};

const SELECT =
  "id,data_agendada,canal,observacao,mensagem,status,resultado,passo_ordem,passo_total,deal_id,contact_id," +
  "contacts(first_name,last_name,phone,temperatura),sequencias_followup(nome)";

type Bucket = "atrasados" | "hoje" | "semana" | "proximos";

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "atrasados", label: "Atrasados", tone: "text-destructive" },
  { key: "hoje", label: "Hoje", tone: "text-accent" },
  { key: "semana", label: "Próximos 7 dias", tone: "text-foreground" },
  { key: "proximos", label: "Depois", tone: "text-muted-foreground" },
];

function bucketOf(iso: string): Bucket {
  const now = new Date();
  const d = new Date(iso);
  const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const endWeek = new Date(endToday.getTime() + 7 * 86400000);
  if (d.getTime() < now.getTime()) return "atrasados";
  if (d <= endToday) return "hoje";
  if (d <= endWeek) return "semana";
  return "proximos";
}

const nomeDo = (r: Row) => [r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" ") || "Lead sem nome";

/** wa.me exige DDI; número brasileiro sem 55 ganha o 55 */
function linkWhatsApp(phone: string | null | undefined, texto: string | null) {
  const digitos = (phone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith("55") && digitos.length >= 12 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

function useAcoes() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["follow-ups-agenda"] });
    qc.invalidateQueries({ queryKey: ["follow-ups-semana"] });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
  };
  const concluir = async (id: string, resultado: string) => {
    const { error } = await supabase
      .from("follow_ups")
      .update({ status: "realizado", realizado_em: new Date().toISOString(), resultado: resultado || null })
      .eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Follow-up realizado" });
    refresh();
  };
  const cancelar = async (id: string) => {
    await supabase.from("follow_ups").update({ status: "cancelado" }).eq("id", id);
    refresh();
  };
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: "Mensagem copiada" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };
  return { concluir, cancelar, copiar };
}

function CartaoFollowUp({ r, compacto = false, atrasado = false }: { r: Row; compacto?: boolean; atrasado?: boolean }) {
  const { concluir, cancelar, copiar } = useAcoes();
  const [concluindo, setConcluindo] = useState(false);
  const [resultado, setResultado] = useState("");
  const wa = r.canal === "WhatsApp" ? linkWhatsApp(r.contacts?.phone, r.mensagem) : null;
  const feito = r.status === "realizado";

  return (
    <Card className={`${compacto ? "p-3" : "p-4"} ${atrasado ? "border-destructive/40" : ""} ${feito ? "opacity-60" : ""}`}>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">{nomeDo(r)}</p>
          {!compacto && <TemperaturaBadge value={r.contacts?.temperatura} />}
          {feito && <Badge variant="secondary" className="text-[10px]">Realizado</Badge>}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className={atrasado ? "font-semibold text-destructive" : ""}>
            {format(new Date(r.data_agendada), compacto ? "HH:mm" : "EEE, dd/MM 'às' HH:mm", { locale: ptBR })}
          </span>
          <span>{r.canal}</span>
          {r.sequencias_followup?.nome && (
            <span className="eyebrow text-[10px]">
              {r.sequencias_followup.nome} {r.passo_ordem}/{r.passo_total}
            </span>
          )}
          {!compacto && r.contacts?.phone && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {r.contacts.phone}</span>
          )}
        </p>
        {r.mensagem && (
          <p className={`whitespace-pre-line rounded-lg bg-muted/50 px-3 py-2 text-sm ${compacto ? "line-clamp-3" : ""}`}>{r.mensagem}</p>
        )}
        {r.observacao && <p className="text-sm text-muted-foreground">{r.observacao}</p>}
        {r.resultado && <p className="text-xs"><span className="font-medium">Resultado: </span>{r.resultado}</p>}
      </div>

      {!feito && (compacto ? (
        <div className="mt-2 flex items-center gap-1">
          {wa && (
            <Button asChild size="icon" className="h-8 w-8" title="Abrir WhatsApp com a mensagem">
              <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /></a>
            </Button>
          )}
          {r.mensagem && (
            <Button size="icon" variant="outline" className="h-8 w-8" title="Copiar mensagem" onClick={() => copiar(r.mensagem!)}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="outline" className="h-8 w-8" title="Marcar como realizado" onClick={() => setConcluindo(true)}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          {r.deal_id && (
            <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="Abrir lead">
              <Link to={`/pipeline?lead=${r.deal_id}`}><ExternalLink className="h-3.5 w-3.5" /></Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {wa && (
            <Button asChild size="sm" className="gap-1.5">
              <a href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp</a>
            </Button>
          )}
          {r.mensagem && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copiar(r.mensagem!)}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setConcluindo(true)}>
            <Check className="h-3.5 w-3.5" /> Realizado
          </Button>
          {r.deal_id && (
            <Button asChild size="sm" variant="ghost" className="gap-1.5">
              <Link to={`/pipeline?lead=${r.deal_id}`}><ExternalLink className="h-3.5 w-3.5" /> Abrir lead</Link>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => cancelar(r.id)} aria-label="Cancelar follow-up">
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}

      {concluindo && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <Textarea rows={2} placeholder="Qual foi o resultado do contato?" value={resultado} onChange={(e) => setResultado(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { concluir(r.id, resultado); setConcluindo(false); }}>Confirmar</Button>
            <Button size="sm" variant="ghost" onClick={() => { setConcluindo(false); setResultado(""); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Lista() {
  const { orgId } = useOrg();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["follow-ups-agenda", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("follow_ups").select(SELECT).eq("org_id", orgId).eq("status", "pendente").order("data_agendada").limit(500);
      return (data ?? []) as Row[];
    },
  });
  const grouped = useMemo(() => {
    const map: Record<Bucket, Row[]> = { atrasados: [], hoje: [], semana: [], proximos: [] };
    for (const r of rows) map[bucketOf(r.data_agendada)].push(r);
    return map;
  }, [rows]);

  if (isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/40" />)}</div>;
  if (!rows.length) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-6 w-6 text-muted-foreground" />}
        title="Nenhum follow-up pendente"
        description="Agende contatos ou aplique uma sequência a partir da ficha de cada lead."
      />
    );
  }
  return (
    <div className="space-y-8">
      {BUCKETS.map(({ key, label, tone }) => {
        const items = grouped[key];
        if (!items.length) return null;
        return (
          <section key={key} className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className={`eyebrow text-[11px] ${tone}`}>{label}</h2>
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((r) => <CartaoFollowUp key={r.id} r={r} atrasado={key === "atrasados"} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Calendario() {
  const { orgId } = useOrg();
  const [cursor, setCursor] = useState(new Date());
  const ini = startOfWeek(cursor, { weekStartsOn: 1 });
  const fim = endOfWeek(cursor, { weekStartsOn: 1 });
  const dias = Array.from({ length: 7 }, (_, i) => addDays(ini, i));

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["follow-ups-semana", orgId, ini.toISOString()],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("follow_ups").select(SELECT).eq("org_id", orgId).neq("status", "cancelado")
        .gte("data_agendada", ini.toISOString()).lte("data_agendada", fim.toISOString()).order("data_agendada");
      return (data ?? []) as Row[];
    },
  });

  const agora = new Date();
  const pendentesSemana = rows.filter((r) => r.status === "pendente").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addWeeks(c, -1))} aria-label="Semana anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>Hoje</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor((c) => addWeeks(c, 1))} aria-label="Próxima semana"><ChevronRight className="h-4 w-4" /></Button>
          <p className="ml-2 text-sm font-semibold">
            {format(ini, "dd/MM")} a {format(fim, "dd/MM/yyyy")}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{pendentesSemana} {pendentesSemana === 1 ? "contato pendente" : "contatos pendentes"} na semana</p>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-7">
          {dias.map((dia) => {
            const doDia = rows.filter((r) => isSameDay(new Date(r.data_agendada), dia));
            const hoje = isSameDay(dia, agora);
            return (
              <div key={dia.toISOString()} className={`flex min-w-0 flex-col gap-2 rounded-[1.125rem] border p-3 ${hoje ? "border-accent bg-accent/5" : "bg-card/60"}`}>
                <div className="flex items-baseline justify-between">
                  <p className="eyebrow text-[10px]">{format(dia, "EEE", { locale: ptBR })}</p>
                  <p className={`text-lg font-bold ${hoje ? "text-accent" : ""}`}>{format(dia, "dd")}</p>
                </div>
                {doDia.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">—</p>
                ) : (
                  doDia.map((r) => (
                    <CartaoFollowUp
                      key={r.id}
                      r={r}
                      compacto
                      atrasado={r.status === "pendente" && new Date(r.data_agendada) < agora}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FollowUps() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow text-[11px]">Comercial</p>
          <h1 className="mt-0.5 text-2xl font-bold">Follow-ups</h1>
          <p className="text-sm text-muted-foreground">
            Cada contato com a data e a mensagem pronta. Abra o WhatsApp, envie e marque como realizado.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/settings?tab=followups"><ListOrdered className="h-4 w-4" /> Sequências</Link>
        </Button>
      </div>
      <Tabs defaultValue="calendario">
        <TabsList>
          <TabsTrigger value="calendario" className="gap-1.5"><CalendarRange className="h-3.5 w-3.5" /> Calendário</TabsTrigger>
          <TabsTrigger value="lista" className="gap-1.5"><List className="h-3.5 w-3.5" /> Lista</TabsTrigger>
        </TabsList>
        <TabsContent value="calendario" className="mt-4"><Calendario /></TabsContent>
        <TabsContent value="lista" className="mt-4"><Lista /></TabsContent>
      </Tabs>
    </div>
  );
}
