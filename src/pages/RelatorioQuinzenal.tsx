import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Printer, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Relatório quinzenal da secretária (Aceleradora SISA).
 *
 * Mesmo desenho da planilha do programa, mas os números vêm do CRM pela
 * função relatorio_quinzenal(): a secretária só escreve as observações e envia.
 * Quinzenas de calendário: dia 1 a 15 e dia 16 ao fim do mês.
 */

interface Numeros {
  leads_recebidos: number;
  em_conversa: number;
  qualificados: number;
  agendados: number;
  compareceram: number;
  faltas: number;
  faltas_reagendadas: number;
  resgatados: number;
  perdas_total: number;
  perdas_por_motivo: Record<string, number>;
  origem: { anuncios: number; instagram: number; indicacao: number; outros: number; sem_origem: number };
}

interface Quinzena {
  chave: string; // yyyy-mm-dd do início
  inicio: Date;
  fim: Date; // exclusivo
  rotulo: string;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function quinzenaDe(d: Date): Quinzena {
  const ano = d.getFullYear();
  const mes = d.getMonth();
  const primeira = d.getDate() <= 15;
  const inicio = new Date(ano, mes, primeira ? 1 : 16);
  const fim = primeira ? new Date(ano, mes, 16) : new Date(ano, mes + 1, 1);
  const ultimoDia = new Date(fim.getTime() - 1).getDate();
  const rotulo = `${inicio.getDate()} a ${ultimoDia} de ${MESES[mes]} de ${ano}`;
  return { chave: iso(inicio), inicio, fim, rotulo };
}

function anteriorA(q: Quinzena): Quinzena {
  return quinzenaDe(new Date(q.inicio.getTime() - 24 * 60 * 60 * 1000));
}

function ultimasQuinzenas(qtd: number): Quinzena[] {
  const lista: Quinzena[] = [];
  let q = quinzenaDe(new Date());
  for (let i = 0; i < qtd; i++) {
    lista.push(q);
    q = anteriorA(q);
  }
  return lista;
}

function useNumeros(q: Quinzena | null) {
  const { orgId } = useOrg();
  return useQuery({
    queryKey: ["relatorio-quinzenal", orgId, q?.chave],
    enabled: !!orgId && !!q,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("relatorio_quinzenal", {
        p_inicio: q!.inicio.toISOString(),
        p_fim: q!.fim.toISOString(),
      });
      if (error) throw error;
      return data as Numeros;
    },
  });
}

const pct = (parte: number, total: number) => (total > 0 ? (parte / total) * 100 : null);
const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

type Melhor = "sobe" | "desce" | "neutro";

interface Linha {
  rotulo: string;
  atual: number | null;
  anterior: number | null;
  tipo: "n" | "pct";
  melhor: Melhor;
  total?: boolean;
}

function Variacao({ linha }: { linha: Linha }) {
  const { atual, anterior, tipo, melhor } = linha;
  if (atual == null || anterior == null) return <span className="text-muted-foreground">—</span>;
  const diff = atual - anterior;
  if (Math.abs(diff) < 0.05) return <span className="text-muted-foreground">=</span>;
  const texto =
    tipo === "pct"
      ? `${diff > 0 ? "+" : ""}${diff.toFixed(1).replace(".", ",")} p.p.`
      : `${diff > 0 ? "+" : ""}${diff}`;
  const bom = melhor === "neutro" ? null : (diff > 0) === (melhor === "sobe");
  const cor = bom == null ? "text-foreground" : bom ? "text-success" : "text-destructive";
  return <span className={`font-medium tabular-nums ${cor}`}>{texto}</span>;
}

function Secao({ numero, titulo, linhas, rodape }: { numero: number; titulo: string; linhas: Linha[]; rodape?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden break-inside-avoid">
      <div className="px-6 pt-5 pb-3">
        <p className="eyebrow text-[11px]">Seção {String(numero).padStart(2, "0")}</p>
        <h2 className="mt-0.5 text-lg font-bold">{titulo}</h2>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-border bg-muted/40">
            <th className="eyebrow px-6 py-2 text-left text-[10px] font-normal">Indicador</th>
            <th className="eyebrow w-28 px-3 py-2 text-right text-[10px] font-normal">Atual</th>
            <th className="eyebrow w-28 px-3 py-2 text-right text-[10px] font-normal">Anterior</th>
            <th className="eyebrow w-28 px-6 py-2 text-right text-[10px] font-normal">Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.rotulo} className={`border-b border-border last:border-0 ${l.total ? "bg-muted/30 font-semibold" : ""}`}>
              <td className="px-6 py-2.5">{l.rotulo}</td>
              <td className="px-3 py-2.5 text-right text-base font-bold tabular-nums">
                {l.tipo === "pct" ? fmtPct(l.atual) : l.atual ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {l.tipo === "pct" ? fmtPct(l.anterior) : l.anterior ?? "—"}
              </td>
              <td className="px-6 py-2.5 text-right">
                <Variacao linha={l} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rodape && <div className="border-t border-border px-6 py-3 text-xs">{rodape}</div>}
    </Card>
  );
}

export default function RelatorioQuinzenal() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const quinzenas = useMemo(() => ultimasQuinzenas(8), []);
  const [chave, setChave] = useState(quinzenas[0].chave);
  const atualQ = quinzenas.find((q) => q.chave === chave) ?? quinzenas[0];
  const anteriorQ = useMemo(() => anteriorA(atualQ), [atualQ]);

  const atual = useNumeros(atualQ);
  const anterior = useNumeros(anteriorQ);

  const { data: clinica } = useQuery({
    queryKey: ["org-nome", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("name").eq("id", orgId!).maybeSingle();
      return data?.name ?? "";
    },
  });

  const observacoes = useQuery({
    queryKey: ["relatorio-obs", orgId, atualQ.chave],
    enabled: !!orgId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("relatorios_quinzenais")
        .select("responsavel,o_que_funcionou,onde_perdemos,acao_proximos")
        .eq("org_id", orgId)
        .eq("inicio", atualQ.chave)
        .maybeSingle();
      return data as null | { responsavel: string | null; o_que_funcionou: string | null; onde_perdemos: string | null; acao_proximos: string | null };
    },
  });

  const [form, setForm] = useState({ responsavel: "", o_que_funcionou: "", onde_perdemos: "", acao_proximos: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const d = observacoes.data;
    setForm({
      responsavel: d?.responsavel ?? "",
      o_que_funcionou: d?.o_que_funcionou ?? "",
      onde_perdemos: d?.onde_perdemos ?? "",
      acao_proximos: d?.acao_proximos ?? "",
    });
  }, [observacoes.data, atualQ.chave]);

  const salvar = async () => {
    if (!orgId) return;
    setSalvando(true);
    const { error } = await (supabase as any).from("relatorios_quinzenais").upsert(
      {
        org_id: orgId,
        inicio: atualQ.chave,
        fim: iso(new Date(atualQ.fim.getTime() - 1)),
        responsavel: form.responsavel.trim() || null,
        o_que_funcionou: form.o_que_funcionou.trim() || null,
        onde_perdemos: form.onde_perdemos.trim() || null,
        acao_proximos: form.acao_proximos.trim() || null,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,inicio" },
    );
    setSalvando(false);
    if (error) {
      toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Observações salvas" });
    qc.invalidateQueries({ queryKey: ["relatorio-obs", orgId, atualQ.chave] });
  };

  const a = atual.data;
  const b = anterior.data;

  const secoes = useMemo(() => {
    if (!a || !b) return null;
    const volume: Linha[] = [
      { rotulo: "Leads recebidos", atual: a.leads_recebidos, anterior: b.leads_recebidos, tipo: "n", melhor: "sobe" },
      { rotulo: "Leads em conversa", atual: a.em_conversa, anterior: b.em_conversa, tipo: "n", melhor: "sobe" },
      { rotulo: "Leads qualificados", atual: a.qualificados, anterior: b.qualificados, tipo: "n", melhor: "sobe" },
    ];
    const conversao: Linha[] = [
      { rotulo: "Consultas agendadas (leads em Ganho)", atual: a.agendados, anterior: b.agendados, tipo: "n", melhor: "sobe" },
      { rotulo: "Taxa de conversão (agendados ÷ leads)", atual: pct(a.agendados, a.leads_recebidos), anterior: pct(b.agendados, b.leads_recebidos), tipo: "pct", melhor: "sobe" },
      { rotulo: "Pacientes que compareceram", atual: a.compareceram, anterior: b.compareceram, tipo: "n", melhor: "sobe" },
      { rotulo: "Taxa de comparecimento", atual: pct(a.compareceram, a.compareceram + a.faltas), anterior: pct(b.compareceram, b.compareceram + b.faltas), tipo: "pct", melhor: "sobe" },
    ];
    const faltas: Linha[] = [
      { rotulo: "Faltas (não compareceram)", atual: a.faltas, anterior: b.faltas, tipo: "n", melhor: "desce" },
      { rotulo: "Taxa de falta", atual: pct(a.faltas, a.compareceram + a.faltas), anterior: pct(b.faltas, b.compareceram + b.faltas), tipo: "pct", melhor: "desce" },
      { rotulo: "Faltas reagendadas", atual: a.faltas_reagendadas, anterior: b.faltas_reagendadas, tipo: "n", melhor: "sobe" },
      { rotulo: "Leads resgatados (voltaram após follow-up)", atual: a.resgatados, anterior: b.resgatados, tipo: "n", melhor: "sobe" },
    ];
    const motivos = Array.from(new Set([...Object.keys(a.perdas_por_motivo ?? {}), ...Object.keys(b.perdas_por_motivo ?? {})]))
      .sort((x, y) => (a.perdas_por_motivo?.[y] ?? 0) - (a.perdas_por_motivo?.[x] ?? 0));
    const perdas: Linha[] = [
      ...motivos.map((m) => ({
        rotulo: m,
        atual: a.perdas_por_motivo?.[m] ?? 0,
        anterior: b.perdas_por_motivo?.[m] ?? 0,
        tipo: "n" as const,
        melhor: "desce" as const,
      })),
      { rotulo: "Total de leads perdidos", atual: a.perdas_total, anterior: b.perdas_total, tipo: "n", melhor: "desce", total: true },
    ];
    const totalOrigem = (o: Numeros["origem"]) => o.anuncios + o.instagram + o.indicacao + o.outros;
    const origem: Linha[] = [
      { rotulo: "Anúncios (tráfego pago)", atual: a.origem.anuncios, anterior: b.origem.anuncios, tipo: "n", melhor: "neutro" },
      { rotulo: "Instagram orgânico", atual: a.origem.instagram, anterior: b.origem.instagram, tipo: "n", melhor: "neutro" },
      { rotulo: "Indicação de paciente", atual: a.origem.indicacao, anterior: b.origem.indicacao, tipo: "n", melhor: "neutro" },
      { rotulo: "Outros canais", atual: a.origem.outros, anterior: b.origem.outros, tipo: "n", melhor: "neutro" },
      { rotulo: "Total com origem registrada", atual: totalOrigem(a.origem), anterior: totalOrigem(b.origem), tipo: "n", melhor: "neutro", total: true },
    ];
    return { volume, conversao, faltas, perdas, origem };
  }, [a, b]);

  const textoWhatsApp = () => {
    if (!a || !b) return "";
    const v = (x: number, y: number) => {
      const d = x - y;
      return d === 0 ? "igual" : `${d > 0 ? "+" : ""}${d} vs. anterior`;
    };
    const linhas = [
      `*Relatório quinzenal de atendimento*`,
      clinica ? `Clínica: ${clinica}` : "",
      `Período: ${atualQ.rotulo}`,
      form.responsavel ? `Responsável: ${form.responsavel}` : "",
      "",
      `Leads recebidos: ${a.leads_recebidos} (${v(a.leads_recebidos, b.leads_recebidos)})`,
      `Consultas agendadas: ${a.agendados} (${v(a.agendados, b.agendados)})`,
      `Taxa de conversão: ${fmtPct(pct(a.agendados, a.leads_recebidos))}`,
      `Compareceram: ${a.compareceram} · Faltas: ${a.faltas} · Reagendadas: ${a.faltas_reagendadas}`,
      `Leads resgatados por follow-up: ${a.resgatados}`,
      `Leads perdidos: ${a.perdas_total}${Object.keys(a.perdas_por_motivo ?? {}).length ? ` (${Object.entries(a.perdas_por_motivo).map(([m, n]) => `${m}: ${n}`).join(", ")})` : ""}`,
      "",
      form.o_que_funcionou ? `*O que funcionou melhor:* ${form.o_que_funcionou}` : "",
      form.onde_perdemos ? `*Onde ainda perdemos leads:* ${form.onde_perdemos}` : "",
      form.acao_proximos ? `*Ação para os próximos 15 dias:* ${form.acao_proximos}` : "",
    ];
    return linhas.filter((l, i, arr) => l !== "" || (arr[i - 1] ?? "") !== "").join("\n").trim();
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(textoWhatsApp());
      toast({ title: "Resumo copiado", description: "Cole no WhatsApp do médico." });
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione o texto da tela e copie manualmente.", variant: "destructive" });
    }
  };

  const carregando = atual.isLoading || anterior.isLoading;
  const erro = atual.error || anterior.error;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 print:max-w-none print:p-0">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-[11px]">Aceleradora SISA</p>
          <h1 className="mt-0.5 text-2xl font-bold">Relatório quinzenal de atendimento</h1>
          <p className="text-sm text-muted-foreground print:hidden">
            Números calculados pelo CRM. Escreva as observações e envie ao médico no mesmo dia.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" onClick={copiar} disabled={!a || !b} className="gap-2">
            <Copy className="h-4 w-4" /> Copiar para WhatsApp
          </Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </header>

      <Card className="grid gap-4 p-6 sm:grid-cols-3">
        <div className="space-y-1">
          <p className="eyebrow text-[10px]">Clínica</p>
          <p className="font-semibold">{clinica || "—"}</p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="responsavel" className="eyebrow text-[10px] font-normal">Responsável pelo atendimento</Label>
          <Input
            id="responsavel"
            value={form.responsavel}
            onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
            placeholder="Nome da secretária"
            className="print:border-0 print:p-0 print:shadow-none"
          />
        </div>
        <div className="space-y-1">
          <p className="eyebrow text-[10px]">Período</p>
          <div className="print:hidden">
            <Select value={chave} onValueChange={setChave}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {quinzenas.map((q, i) => (
                  <SelectItem key={q.chave} value={q.chave}>
                    {q.rotulo}{i === 0 ? " (atual)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="hidden font-semibold print:block">{atualQ.rotulo}</p>
          <p className="text-xs text-muted-foreground">Comparado com {anteriorQ.rotulo}</p>
        </div>
      </Card>

      {carregando && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {erro && <p className="text-sm text-destructive">Não foi possível calcular o relatório: {(erro as Error).message}</p>}

      {secoes && a && (
        <>
          <Secao numero={1} titulo="Volume de leads" linhas={secoes.volume} />
          <Secao numero={2} titulo="Conversão" linhas={secoes.conversao} />
          <Secao numero={3} titulo="Faltas e recuperação" linhas={secoes.faltas} />
          <Secao
            numero={4}
            titulo="Perdas: por que o lead não fechou"
            linhas={secoes.perdas}
            rodape={<span className="text-muted-foreground">Um lead pode ter mais de um motivo registrado, por isso a soma dos motivos pode passar do total.</span>}
          />
          <Secao
            numero={5}
            titulo="Origem dos leads"
            linhas={secoes.origem}
            rodape={
              a.origem.sem_origem > 0 ? (
                <span className="font-medium text-destructive">
                  {a.origem.sem_origem} {a.origem.sem_origem === 1 ? "lead está" : "leads estão"} sem origem registrada no CRM. Complete o canal na ficha do lead para o total bater com os leads recebidos.
                </span>
              ) : (
                <span className="text-success">Todos os leads da quinzena têm origem registrada.</span>
              )
            }
          />

          <Card className="space-y-4 p-6 break-inside-avoid">
            <div>
              <p className="eyebrow text-[11px]">Seção 06</p>
              <h2 className="mt-0.5 text-lg font-bold">Observações da quinzena</h2>
            </div>
            {([
              ["o_que_funcionou", "O que funcionou melhor"],
              ["onde_perdemos", "Onde ainda perdemos leads"],
              ["acao_proximos", "Ação para os próximos 15 dias"],
            ] as const).map(([campo, rotulo]) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={campo}>{rotulo}</Label>
                <Textarea
                  id={campo}
                  rows={3}
                  value={form[campo]}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  className="print:min-h-0 print:resize-none print:border-0 print:p-0"
                />
              </div>
            ))}
            <div className="flex justify-end print:hidden">
              <Button onClick={salvar} disabled={salvando} className="gap-2">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar observações
              </Button>
            </div>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Relatório gerado no SISA · Aceleradora SISA · Grazielle Silva Santos
          </p>
        </>
      )}
    </div>
  );
}
