import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, ListPlus, Loader2, Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOLLOWUP_CANAIS, type FollowUpCanal } from "@/components/leads/constants";

/**
 * Sequências de follow-up: modelos com passos (dias + canal + mensagem).
 * Aplicar num lead agenda todos os passos de uma vez pela função
 * aplicar_sequencia_followup (o banco troca {nome} pelo primeiro nome).
 */

export interface Passo {
  id?: string;
  ordem: number;
  dias: number;
  canal: FollowUpCanal;
  mensagem: string;
}

export interface Sequencia {
  id: string;
  nome: string;
  descricao: string | null;
  ativa: boolean;
  sequencia_passos: Passo[];
}

export function useSequencias() {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["sequencias-followup", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sequencias_followup")
        .select("id,nome,descricao,ativa,sequencia_passos(id,ordem,dias,canal,mensagem)")
        .eq("org_id", orgId)
        .order("nome");
      if (error) throw error;
      return ((data ?? []) as Sequencia[]).map((s) => ({
        ...s,
        sequencia_passos: [...(s.sequencia_passos ?? [])].sort((a, b) => a.ordem - b.ordem || a.dias - b.dias),
      }));
    },
  });
}

const resumoPassos = (passos: Passo[]) => passos.map((p) => `${p.dias} ${p.dias === 1 ? "dia" : "dias"}`).join(" · ");

/* ------------------------------------------------------------------ */
/* Editor (Configurações → Follow-ups)                                  */
/* ------------------------------------------------------------------ */

const PASSO_VAZIO = (ordem: number, dias: number): Passo => ({ ordem, dias, canal: "WhatsApp", mensagem: "" });
const MAX_FOLLOWUPS = 15;

function EditorSequencia({ inicial, onFechar }: { inicial: Sequencia | null; onFechar: () => void }) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [passos, setPassos] = useState<Passo[]>(
    inicial?.sequencia_passos.length ? inicial.sequencia_passos : [PASSO_VAZIO(1, 3), PASSO_VAZIO(2, 7), PASSO_VAZIO(3, 20)],
  );
  const [salvando, setSalvando] = useState(false);

  const mudar = (i: number, campo: keyof Passo, valor: string | number) =>
    setPassos((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: valor } : p)));

  // Quantidade de follow-ups: aumentar acrescenta no fim (7 dias depois do último),
  // diminuir tira os últimos. O que já foi escrito nos que ficam não se perde.
  const definirQuantidade = (n: number) => {
    const alvo = Math.min(MAX_FOLLOWUPS, Math.max(1, Math.round(n) || 1));
    setPassos((ps) => {
      if (alvo <= ps.length) return ps.slice(0, alvo);
      const novos = [...ps];
      while (novos.length < alvo) {
        novos.push(PASSO_VAZIO(novos.length + 1, (novos[novos.length - 1]?.dias ?? 0) + 7));
      }
      return novos;
    });
  };

  const salvar = async () => {
    if (!orgId) return;
    if (!nome.trim()) return toast({ title: "Dê um nome à sequência", variant: "destructive" });
    const semMensagem = passos.findIndex((p) => !p.mensagem.trim());
    if (semMensagem >= 0) {
      return toast({ title: `Falta a mensagem do follow-up ${semMensagem + 1}`, variant: "destructive" });
    }
    if (passos.some((p) => !Number.isFinite(p.dias) || p.dias < 0 || p.dias > 365)) {
      return toast({ title: "Os dias precisam ficar entre 0 e 365", variant: "destructive" });
    }
    const validos = passos;
    setSalvando(true);
    try {
      let id = inicial?.id;
      if (id) {
        const { error } = await (supabase as any)
          .from("sequencias_followup")
          .update({ nome: nome.trim(), updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
        const { error: delErr } = await (supabase as any).from("sequencia_passos").delete().eq("sequencia_id", id);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await (supabase as any)
          .from("sequencias_followup")
          .insert({ org_id: orgId, nome: nome.trim(), created_by: user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        id = data.id;
      }
      const ordenados = [...validos].sort((a, b) => a.dias - b.dias);
      const { error: pErr } = await (supabase as any).from("sequencia_passos").insert(
        ordenados.map((p, i) => ({
          org_id: orgId,
          sequencia_id: id,
          ordem: i + 1,
          dias: Number(p.dias),
          canal: p.canal,
          mensagem: p.mensagem.trim(),
        })),
      );
      if (pErr) throw pErr;
      toast({ title: "Sequência salva" });
      qc.invalidateQueries({ queryKey: ["sequencias-followup"] });
      onFechar();
    } catch (err: any) {
      toast({ title: "Não foi possível salvar", description: err?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="space-y-5 p-6">
      <div>
        <p className="eyebrow text-[11px]">{inicial ? "Editar sequência" : "Nova sequência"}</p>
        <div className="mt-2 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="seq-nome">Nome</Label>
            <Input id="seq-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Menopausa, Parou depois do valor" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seq-qtd">Quantos follow-ups</Label>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={passos.length <= 1}
                onClick={() => definirQuantidade(passos.length - 1)}
                aria-label="Menos um follow-up"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                id="seq-qtd"
                type="number"
                min={1}
                max={MAX_FOLLOWUPS}
                className="w-16 text-center"
                value={passos.length}
                onChange={(e) => definirQuantidade(Number(e.target.value))}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={passos.length >= MAX_FOLLOWUPS}
                onClick={() => definirQuantidade(passos.length + 1)}
                aria-label="Mais um follow-up"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {passos.map((p, i) => (
          <div key={i} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-end gap-3">
              <span className="eyebrow pb-2 text-[10px]">Follow-up {String(i + 1).padStart(2, "0")}</span>
              <div className="space-y-1">
                <Label className="text-xs">Depois de</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    className="w-20"
                    value={p.dias}
                    onChange={(e) => mudar(i, "dias", e.target.value === "" ? 0 : Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">dias</span>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Canal</Label>
                <Select value={p.canal} onValueChange={(v) => mudar(i, "canal", v)}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FOLLOWUP_CANAIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                disabled={passos.length === 1}
                onClick={() => setPassos((ps) => ps.filter((_, j) => j !== i))}
                aria-label="Remover este follow-up"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              className="mt-3"
              rows={3}
              value={p.mensagem}
              onChange={(e) => mudar(i, "mensagem", e.target.value)}
              placeholder="Oi {nome}, tudo bem? ..."
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Escreva <strong>{"{nome}"}</strong> onde entra o primeiro nome do lead. Os dias contam a partir do dia em que a sequência é aplicada.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar sequência
        </Button>
      </div>
    </Card>
  );
}

export function SequenciasManager() {
  const { data: sequencias = [], isLoading } = useSequencias();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editando, setEditando] = useState<Sequencia | null | "nova">(null);

  const alternarAtiva = async (s: Sequencia) => {
    const { error } = await (supabase as any).from("sequencias_followup").update({ ativa: !s.ativa }).eq("id", s.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    qc.invalidateQueries({ queryKey: ["sequencias-followup"] });
  };

  if (editando) {
    return <EditorSequencia inicial={editando === "nova" ? null : editando} onFechar={() => setEditando(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Monte o roteiro uma vez e aplique em qualquer lead: as datas e as mensagens já entram na agenda.
        </p>
        <Button className="gap-2" onClick={() => setEditando("nova")}>
          <ListPlus className="h-4 w-4" /> Nova sequência
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : sequencias.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="font-semibold">Nenhuma sequência criada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Exemplo: "Menopausa" com mensagem em 3, 7 e 20 dias depois do primeiro contato.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {sequencias.map((s) => (
            <Card key={s.id} className={`flex flex-col gap-3 p-5 ${s.ativa ? "" : "opacity-60"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow text-[10px]">{s.sequencia_passos.length} {s.sequencia_passos.length === 1 ? "contato" : "contatos"}</p>
                  <h3 className="mt-0.5 text-lg font-bold">{s.nome}</h3>
                  <p className="text-xs text-muted-foreground">{resumoPassos(s.sequencia_passos)}</p>
                </div>
                {!s.ativa && <Badge variant="outline">Pausada</Badge>}
              </div>
              <ol className="space-y-2 text-sm">
                {s.sequencia_passos.map((p, i) => (
                  <li key={p.id ?? i} className="rounded-lg bg-muted/40 px-3 py-2">
                    <span className="font-medium">{p.dias} {p.dias === 1 ? "dia" : "dias"} · {p.canal}</span>
                    <p className="line-clamp-2 text-muted-foreground">{p.mensagem}</p>
                  </li>
                ))}
              </ol>
              <div className="mt-auto flex gap-2 border-t pt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditando(s)}>
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => alternarAtiva(s)}>
                  {s.ativa ? "Pausar" : "Reativar"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aplicar sequência num lead (ficha do lead e cadastro)               */
/* ------------------------------------------------------------------ */

export async function aplicarSequencia(dealId: string, sequenciaId: string, inicio: Date, hora: string) {
  const { data, error } = await (supabase as any).rpc("aplicar_sequencia_followup", {
    p_deal: dealId,
    p_sequencia: sequenciaId,
    p_inicio: format(inicio, "yyyy-MM-dd"),
    p_hora: hora,
  });
  if (error) throw error;
  return data as number;
}

export function SeletorSequencia({
  valor,
  onChange,
  incluirNenhuma = true,
}: {
  valor: string;
  onChange: (v: string) => void;
  incluirNenhuma?: boolean;
}) {
  const { data: sequencias = [] } = useSequencias();
  const ativas = sequencias.filter((s) => s.ativa && s.sequencia_passos.length);
  return (
    <Select value={valor} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Escolha uma sequência" /></SelectTrigger>
      <SelectContent>
        {incluirNenhuma && <SelectItem value="none">Nenhuma</SelectItem>}
        {ativas.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.nome} ({resumoPassos(s.sequencia_passos)})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AplicarSequencia({ dealId, onAplicada }: { dealId: string; onAplicada: () => void }) {
  const { data: sequencias = [] } = useSequencias();
  const { toast } = useToast();
  const [seqId, setSeqId] = useState("none");
  const [inicio, setInicio] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hora, setHora] = useState("09:00");
  const [aplicando, setAplicando] = useState(false);

  const seq = sequencias.find((s) => s.id === seqId);
  const previa = useMemo(() => {
    if (!seq) return [];
    const base = new Date(`${inicio}T00:00:00`);
    return seq.sequencia_passos.map((p) => ({ ...p, quando: addDays(base, p.dias) }));
  }, [seq, inicio]);

  useEffect(() => { setSeqId("none"); }, [dealId]);

  const aplicar = async () => {
    if (!seq) return;
    setAplicando(true);
    try {
      const n = await aplicarSequencia(dealId, seq.id, new Date(`${inicio}T00:00:00`), hora);
      toast({ title: "Sequência agendada", description: `${n} ${n === 1 ? "contato agendado" : "contatos agendados"} na agenda de follow-ups.` });
      setSeqId("none");
      onAplicada();
    } catch (err: any) {
      toast({ title: "Não foi possível agendar", description: err?.message, variant: "destructive" });
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-accent" />
        <p className="text-sm font-semibold">Aplicar sequência</p>
      </div>
      {sequencias.filter((s) => s.ativa).length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhuma sequência criada ainda.{" "}
          <Link to="/settings?tab=followups" className="font-medium text-accent underline-offset-2 hover:underline">
            Criar em Configurações → Follow-ups
          </Link>
        </p>
      ) : (
        <>
          <SeletorSequencia valor={seqId} onChange={setSeqId} />
          {seq && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Contar a partir de</Label>
                  <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Horário dos contatos</Label>
                  <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
                </div>
              </div>
              <ol className="space-y-1.5">
                {previa.map((p, i) => (
                  <li key={i} className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                    <span className="font-semibold capitalize">
                      {format(p.quando, "EEE, dd/MM", { locale: ptBR })} às {hora}
                    </span>
                    <span className="text-muted-foreground"> · {p.canal}</span>
                    <p className="mt-0.5 line-clamp-2 text-muted-foreground">{p.mensagem}</p>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">
                Se este lead já tiver contatos pendentes desta mesma sequência, eles são substituídos.
              </p>
              <Button className="w-full" onClick={aplicar} disabled={aplicando}>
                {aplicando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Agendar {previa.length} {previa.length === 1 ? "contato" : "contatos"}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
