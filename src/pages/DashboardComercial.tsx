import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { BarList, FiltroPeriodo, MetricCard } from "@/components/dashboards/DashboardBits";
import { TEMPERATURA_LABELS } from "@/components/leads/constants";
import {
  ehConvertido,
  filtrarLeads,
  formatarTaxa,
  intervaloDoPeriodo,
  porTemperatura,
  rankingIndicadores,
  rankingObjecoes,
  taxa,
  useCrmMetrics,
  type PeriodoCustom,
  type PeriodoValue,
} from "@/hooks/useCrmMetrics";

export default function DashboardComercial() {
  const [periodo, setPeriodo] = useState<PeriodoValue>("30");
  const [custom, setCustom] = useState<PeriodoCustom>({ de: "", ate: "" });
  const { isLoading, error, leads, stageById, objecoesPorDeal, nomesDeContatos } = useCrmMetrics();
  const { orgId } = useOrg();

  // Comparecimento vem da Agenda: consultas do período marcadas como
  // compareceu (attended) ou faltou (no_show). Consulta ainda não resolvida
  // (scheduled/confirmed) ou cancelada não entra na conta.
  const { de, ate } = intervaloDoPeriodo(periodo, custom);
  const consultas = useQuery({
    queryKey: ["comparecimento", orgId, de?.toISOString() ?? null, ate?.toISOString() ?? null],
    enabled: !!orgId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("activities")
        .select("appointment_status")
        .eq("org_id", orgId)
        .in("appointment_status", ["attended", "no_show"]);
      if (de) q = q.gte("due_date", de.toISOString());
      if (ate) q = q.lte("due_date", ate.toISOString());
      const { data, error: err } = await q;
      if (err) throw err;
      const lista = (data ?? []) as { appointment_status: string }[];
      return {
        compareceram: lista.filter((c) => c.appointment_status === "attended").length,
        resolvidas: lista.length,
      };
    },
  });

  const m = useMemo(() => {
    const filtrados = filtrarLeads(leads, { periodo, custom });
    const convertidos = filtrados.filter((l) => ehConvertido(l, stageById)).length;
    return {
      novos: filtrados.length,
      convertidos,
      conversao: taxa(convertidos, filtrados.length),
      temperaturas: porTemperatura(filtrados, stageById),
      objecoes: rankingObjecoes(filtrados, objecoesPorDeal),
      indicadores: rankingIndicadores(filtrados, stageById, nomesDeContatos),
    };
  }, [leads, stageById, objecoesPorDeal, nomesDeContatos, periodo, custom]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-destructive">Não foi possível carregar os dados do pipeline.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard comercial</h1>
          <p className="text-sm text-muted-foreground">
            Conversão, comparecimento na agenda, temperatura da base, objeções e quem mais indica.
          </p>
        </div>
        <FiltroPeriodo
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          custom={custom}
          onCustomChange={setCustom}
        />
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Novos leads" value={m.novos} />
        <MetricCard label="Ganhos" value={m.convertidos} tone="positivo" />
        <MetricCard
          label="Taxa de conversão"
          value={formatarTaxa(m.conversao)}
          hint={`${m.convertidos} de ${m.novos} leads viraram pacientes`}
          tone="positivo"
        />
        <MetricCard
          label="Taxa de comparecimento"
          value={formatarTaxa(taxa(consultas.data?.compareceram ?? 0, consultas.data?.resolvidas ?? 0))}
          hint={
            consultas.data?.resolvidas
              ? `${consultas.data.compareceram} de ${consultas.data.resolvidas} consultas da agenda`
              : "Nenhuma consulta marcada como compareceu ou faltou no período"
          }
          tone="positivo"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {m.temperaturas.map((t) => (
          <MetricCard
            key={t.temperatura}
            label={`Leads ${TEMPERATURA_LABELS[t.temperatura].toLowerCase()}s`}
            value={t.total}
            hint={`${formatarTaxa(t.participacao)} da base · converte ${formatarTaxa(t.conversao)}`}
            tone={t.temperatura}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Objeções mais registradas"
          items={m.objecoes}
          emptyMessage="Nenhuma objeção registrada no período."
        />
        <BarList
          title="Ranking de indicadores"
          items={m.indicadores}
          emptyMessage="Nenhum lead veio por indicação no período."
          mostrarConversao
        />
      </section>
    </div>
  );
}
