import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const MOTIVOS = ["Reunião", "Almoço", "Folga", "Congresso", "Bloqueio pessoal", "Outro"];

const REPETICOES = [
  { value: "0", label: "Não repetir" },
  { value: "7", label: "Toda semana" },
  { value: "14", label: "A cada 15 dias" },
  { value: "28", label: "A cada 4 semanas" },
] as const;

/** Quantas ocorrencias gerar quando o bloqueio repete. */
const OCORRENCIAS = 26;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  professionals: { id: string; name: string }[];
  /** Horario clicado na grade, se houver. */
  quandoInicial?: Date | null;
  onCreated?: () => void;
}

function paraInput(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

export function BloqueioCreateModal({
  open, onOpenChange, professionals, quandoInicial, onCreated,
}: Props) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const [titulo, setTitulo] = useState(MOTIVOS[0]);
  const [tituloLivre, setTituloLivre] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [professionalId, setProfessionalId] = useState("todos");
  const [observacao, setObservacao] = useState("");
  const [repeticao, setRepeticao] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = quandoInicial ?? new Date();
    const depois = new Date(base.getTime() + 60 * 60000);
    setInicio(paraInput(base));
    setFim(paraInput(depois));
    setTitulo(MOTIVOS[0]);
    setTituloLivre("");
    setObservacao("");
    setProfessionalId("todos");
    setRepeticao("0");
  }, [open, quandoInicial]);

  const nomeFinal = titulo === "Outro" ? tituloLivre.trim() : titulo;
  const podeSalvar = !!nomeFinal && !!inicio && !!fim && new Date(fim) > new Date(inicio);

  const salvar = async () => {
    if (!orgId || !podeSalvar) return;
    setSaving(true);
    try {
      const intervalo = Number(repeticao);
      const total = intervalo > 0 ? OCORRENCIAS : 1;
      const grupoId = intervalo > 0 ? crypto.randomUUID() : null;
      const baseInicio = new Date(inicio);
      const baseFim = new Date(fim);

      const linhas = Array.from({ length: total }, (_, i) => {
        const ini = new Date(baseInicio); ini.setDate(ini.getDate() + i * intervalo);
        const f = new Date(baseFim); f.setDate(f.getDate() + i * intervalo);
        return {
          org_id: orgId,
          titulo: nomeFinal,
          inicio: ini.toISOString(),
          fim: f.toISOString(),
          observacao: observacao.trim() || null,
          professional_id: professionalId === "todos" ? null : professionalId,
          created_by: user?.id ?? null,
          grupo_id: grupoId,
        };
      });

      const { error } = await (supabase as any).from("agenda_bloqueios").insert(linhas);
      if (error) throw error;
      toast({
        title: "Horário bloqueado",
        description: total > 1 ? `${nomeFinal} · ${total} ocorrências criadas` : nomeFinal,
      });
      onOpenChange(false);
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro ao bloquear", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Bloquear horário</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={titulo} onValueChange={setTitulo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {titulo === "Outro" && (
            <div className="space-y-1.5">
              <Label>Qual motivo?</Label>
              <Input value={tituloLivre} onChange={(e) => setTituloLivre(e.target.value)} placeholder="Ex.: Visita técnica" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Médico</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Toda a clínica</SelectItem>
                {professionals.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Repetir</Label>
            <Select value={repeticao} onValueChange={setRepeticao}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPETICOES.map((r) => (<SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>))}
              </SelectContent>
            </Select>
            {repeticao !== "0" && (
              <p className="text-xs text-muted-foreground">
                Serão criadas {OCORRENCIAS} ocorrências. Ao remover, você escolhe entre apagar
                só aquela data ou toda a série.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={!podeSalvar || saving}>{saving ? "Salvando…" : "Bloquear"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
