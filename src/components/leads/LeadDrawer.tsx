import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import {
  useAnuncios, useContactsLite, useDealObjecoes, useLeadFollowUps, useObjecoes, useStageHistory, type Stage,
} from "@/hooks/useLeads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { CalendarClock, Check, Plus, Trash2, ArrowRight, History } from "lucide-react";
import { TagPicker } from "./TagPicker";
import {
  CANAIS, FOLLOWUP_CANAIS, TEMPERATURAS, formatCurrency, isOverdue, leadName,
  type FollowUpCanal, type Lead, type Temperatura,
} from "./constants";

interface Props {
  lead: Lead | null;
  stages: Stage[];
  currency: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SEM_ANUNCIO = "sem-anuncio";

export function LeadDrawer({ lead, stages, currency, open, onOpenChange, onChanged }: Props) {
  const { data: anunciosLista = [] } = useAnuncios();
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: contacts = [] } = useContactsLite();
  const { data: followUps = [] } = useLeadFollowUps(lead?.id ?? null);
  const { data: dealObjecoes = [] } = useDealObjecoes(lead?.id ?? null);
  const { data: objecoes = [] } = useObjecoes();
  const { data: history = [] } = useStageHistory(lead?.id ?? null);

  const [form, setForm] = useState({
    first_name: "", last_name: "", phone: "", email: "",
    canal: "", anuncio: "", temperatura: "" as Temperatura | "",
    indicado_por: "", value: "", stage_id: "", dor_relatada: "",
  });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Novo follow-up
  const [showFuForm, setShowFuForm] = useState(false);
  const [fu, setFu] = useState({ data: toLocalInput(new Date()), canal: "WhatsApp" as FollowUpCanal, observacao: "" });

  // Concluir follow-up
  const [doneId, setDoneId] = useState<string | null>(null);
  const [resultado, setResultado] = useState("");

  const [novaObjecao, setNovaObjecao] = useState("");

  useEffect(() => {
    if (!lead) return;
    const c = lead.contact;
    setForm({
      first_name: c?.first_name ?? "",
      last_name: c?.last_name ?? "",
      phone: c?.phone ?? "",
      email: c?.email ?? "",
      canal: c?.canal ?? "",
      anuncio: c?.anuncio ?? "",
      temperatura: (c?.temperatura as Temperatura) ?? "",
      indicado_por: c?.indicado_por_contact_id ?? "",
      value: lead.value != null ? String(lead.value) : "",
      stage_id: lead.stage_id ?? "",
      dor_relatada: lead.dor_relatada ?? "",
    });
    setTagIds(lead.tags.map((t) => t.id));
    setShowFuForm(false);
    setDoneId(null);
    setResultado("");
  }, [lead]);

  const stageName = useMemo(
    () => (id?: string | null) => stages.find((s) => s.id === id)?.name ?? "—",
    [stages],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["leads-board"] });
    qc.invalidateQueries({ queryKey: ["lead-follow-ups", lead?.id] });
    qc.invalidateQueries({ queryKey: ["deal-objecoes", lead?.id] });
    qc.invalidateQueries({ queryKey: ["deal-stage-history", lead?.id] });
    qc.invalidateQueries({ queryKey: ["follow-ups-agenda"] });
    onChanged();
  };

  const saveDados = async () => {
    if (!lead || !orgId) return;
    setSaving(true);
    try {
      if (lead.contact_id) {
        const { error } = await supabase
          .from("contacts")
          .update({
            first_name: form.first_name || null,
            last_name: form.last_name || null,
            phone: form.phone || null,
            email: form.email || null,
            canal: form.canal || null,
            anuncio: form.anuncio || null,
            temperatura: form.temperatura || null,
            indicado_por_contact_id: form.indicado_por || null,
          })
          .eq("id", lead.contact_id);
        if (error) throw error;

        // Sincroniza tags
        const current = lead.tags.map((t) => t.id);
        const toAdd = tagIds.filter((id) => !current.includes(id));
        const toRemove = current.filter((id) => !tagIds.includes(id));
        if (toAdd.length) {
          await supabase
            .from("contact_tags")
            .insert(toAdd.map((tag_id) => ({ org_id: orgId, contact_id: lead.contact_id!, tag_id })));
        }
        if (toRemove.length) {
          await supabase.from("contact_tags").delete().eq("contact_id", lead.contact_id).in("tag_id", toRemove);
        }
      }

      const { error: dErr } = await supabase
        .from("deals")
        .update({
          value: form.value ? Number(form.value) : 0,
          dor_relatada: form.dor_relatada.trim() || null,
          stage_id: form.stage_id || null,
          title: [form.first_name, form.last_name].filter(Boolean).join(" ") || lead.title,
        })
        .eq("id", lead.id);
      if (dErr) throw dErr;

      toast({ title: "Lead atualizado" });
      refresh();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const agendarFollowUp = async () => {
    if (!lead || !orgId) return;
    const { error } = await supabase.from("follow_ups").insert({
      org_id: orgId,
      deal_id: lead.id,
      contact_id: lead.contact_id,
      created_by: user?.id ?? null,
      data_agendada: new Date(fu.data).toISOString(),
      canal: fu.canal,
      observacao: fu.observacao || null,
      status: "pendente",
    });
    if (error) {
      toast({ title: "Erro ao agendar", description: error.message, variant: "destructive" });
      return;
    }
    setFu({ data: toLocalInput(new Date()), canal: "WhatsApp", observacao: "" });
    setShowFuForm(false);
    toast({ title: "Follow-up agendado" });
    refresh();
  };

  const concluirFollowUp = async (id: string) => {
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
    setShowFuForm(true);
    toast({ title: "Follow-up realizado", description: "Agende o próximo contato." });
    refresh();
  };

  const cancelarFollowUp = async (id: string) => {
    await supabase.from("follow_ups").update({ status: "cancelado" }).eq("id", id);
    refresh();
  };

  const addObjecao = async (objecaoId: string) => {
    if (!lead || !orgId) return;
    await supabase
      .from("deal_objecoes")
      .insert({ org_id: orgId, deal_id: lead.id, objecao_id: objecaoId, created_by: user?.id ?? null });
    setNovaObjecao("");
    refresh();
  };

  const removeObjecao = async (id: string) => {
    await supabase.from("deal_objecoes").delete().eq("id", id);
    refresh();
  };

  const timeline = useMemo(() => {
    const items: { id: string; date: string; text: string; type: "stage" | "followup" }[] = [];
    for (const h of history) {
      items.push({
        id: `h-${h.id}`,
        date: h.created_at,
        type: "stage",
        text: h.from_stage_id
          ? `Etapa: ${stageName(h.from_stage_id)} → ${stageName(h.to_stage_id)}`
          : `Lead criado em ${stageName(h.to_stage_id)}`,
      });
    }
    for (const f of followUps.filter((f) => f.status === "realizado")) {
      items.push({
        id: `f-${f.id}`,
        date: f.realizado_em ?? f.data_agendada,
        type: "followup",
        text: `Follow-up (${f.canal}) realizado${f.resultado ? `: ${f.resultado}` : ""}`,
      });
    }
    return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, followUps, stageName]);

  const usedObjecaoIds = dealObjecoes.map((o: any) => o.objecao_id);

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">{leadName(lead)}</SheetTitle>
          <SheetDescription>
            {stageName(lead.stage_id)} · {formatCurrency(Number(lead.value ?? 0), currency)}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="dados" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="objecoes">Objeções</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          {/* DADOS */}
          <TabsContent value="dados" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Sobrenome</Label>
                <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Temperatura</Label>
                <Select value={form.temperatura} onValueChange={(v) => setForm({ ...form, temperatura: v as Temperatura })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {TEMPERATURAS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={form.canal} onValueChange={(v) => setForm({ ...form, canal: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set([...CANAIS, ...(form.canal ? [form.canal] : [])])).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor</Label>
                <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={form.stage_id} onValueChange={(v) => setForm({ ...form, stage_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Anúncio / criativo</Label>
              <Select
                value={form.anuncio || SEM_ANUNCIO}
                onValueChange={(v) => setForm({ ...form, anuncio: v === SEM_ANUNCIO ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o anúncio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_ANUNCIO}>Sem anúncio</SelectItem>
                  {anunciosLista.map((a) => (
                    <SelectItem key={a.id} value={a.nome}>{a.nome}</SelectItem>
                  ))}
                  {form.anuncio && !anunciosLista.some((a) => a.nome === form.anuncio) && (
                    <SelectItem value={form.anuncio}>{form.anuncio} (inativo)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Dor relatada</Label>
              <Textarea
                rows={3}
                value={form.dor_relatada}
                onChange={(e) => setForm({ ...form, dor_relatada: e.target.value })}
                placeholder="O que a pessoa falou, com as palavras dela."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Indicado por</Label>
              <Select
                value={form.indicado_por || "none"}
                onValueChange={(v) => setForm({ ...form, indicado_por: v === "none" ? "" : v })}
              >
                <SelectTrigger><SelectValue placeholder="Ninguém" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ninguém</SelectItem>
                  {contacts.filter((c) => c.id !== lead.contact_id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Sem nome"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tags</Label>
              <TagPicker selected={tagIds} onChange={setTagIds} />
            </div>

            <Button onClick={saveDados} disabled={saving} className="w-full">Salvar alterações</Button>
          </TabsContent>

          {/* FOLLOW-UPS */}
          <TabsContent value="followups" className="space-y-4 pt-4">
            {!showFuForm ? (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowFuForm(true)}>
                <Plus className="h-4 w-4" /> Agendar follow-up
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Data e hora</Label>
                    <Input type="datetime-local" value={fu.data} onChange={(e) => setFu({ ...fu, data: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Canal</Label>
                    <Select value={fu.canal} onValueChange={(v) => setFu({ ...fu, canal: v as FollowUpCanal })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FOLLOWUP_CANAIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea value={fu.observacao} onChange={(e) => setFu({ ...fu, observacao: e.target.value })} rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={agendarFollowUp} className="flex-1">Agendar</Button>
                  <Button variant="outline" onClick={() => setShowFuForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            <Separator />

            {followUps.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum follow-up registrado.</p>
            )}

            <div className="space-y-3">
              {followUps.map((f) => {
                const late = f.status === "pendente" && isOverdue(f.data_agendada);
                return (
                  <div key={f.id} className={`rounded-lg border p-3 ${late ? "border-destructive/50 bg-destructive/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`flex items-center gap-1.5 text-sm font-medium ${late ? "text-destructive" : ""}`}>
                          <CalendarClock className="h-3.5 w-3.5" />
                          {new Date(f.data_agendada).toLocaleString("pt-BR")}
                        </p>
                        <p className="text-xs text-muted-foreground">{f.canal}</p>
                      </div>
                      <Badge variant={f.status === "realizado" ? "secondary" : late ? "destructive" : "outline"} className="text-[10px]">
                        {f.status === "realizado" ? "Realizado" : f.status === "cancelado" ? "Cancelado" : late ? "Atrasado" : "Pendente"}
                      </Badge>
                    </div>
                    {f.observacao && <p className="mt-2 text-sm">{f.observacao}</p>}
                    {f.resultado && (
                      <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs">
                        <span className="font-medium">Resultado: </span>{f.resultado}
                      </p>
                    )}

                    {f.status === "pendente" && (
                      doneId === f.id ? (
                        <div className="mt-3 space-y-2">
                          <Textarea
                            placeholder="Qual foi o resultado do contato?"
                            value={resultado}
                            onChange={(e) => setResultado(e.target.value)}
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => concluirFollowUp(f.id)}>Confirmar</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDoneId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline" className="gap-1" onClick={() => setDoneId(f.id)}>
                            <Check className="h-3.5 w-3.5" /> Marcar como realizado
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => cancelarFollowUp(f.id)}>Cancelar</Button>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* OBJEÇÕES */}
          <TabsContent value="objecoes" className="space-y-4 pt-4">
            <div className="flex gap-2">
              <Select value={novaObjecao} onValueChange={(v) => addObjecao(v)}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar objeção..." /></SelectTrigger>
                <SelectContent>
                  {objecoes.filter((o) => !usedObjecaoIds.includes(o.id)).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {dealObjecoes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma objeção registrada.</p>
            ) : (
              <div className="space-y-2">
                {dealObjecoes.map((o: any) => (
                  <div key={o.id} className="flex items-center justify-between rounded-md border p-2.5">
                    <span className="flex items-center gap-2 text-sm">
                      <span className="h-2 w-2 rounded-full" style={{ background: o.objecoes?.color ?? "#ef4444" }} />
                      {o.objecoes?.label}
                    </span>
                    <Button size="icon" variant="ghost" onClick={() => removeObjecao(o.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* HISTÓRICO */}
          <TabsContent value="historico" className="space-y-3 pt-4">
            {timeline.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem histórico ainda.</p>
            ) : (
              timeline.map((item) => (
                <div key={item.id} className="flex gap-3 rounded-md border p-3">
                  <div className="mt-0.5 text-muted-foreground">
                    {item.type === "stage" ? <ArrowRight className="h-4 w-4" /> : <History className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm">{item.text}</p>
                    <p className="text-xs text-muted-foreground">{new Date(item.date).toLocaleString("pt-BR")}</p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
