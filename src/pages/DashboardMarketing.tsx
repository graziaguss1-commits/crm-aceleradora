import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { BarList, FiltroPeriodo, FiltroSelect, MetricCard } from "@/components/dashboards/DashboardBits";
import { TEMPERATURA_LABELS } from "@/components/leads/constants";
import {
  agruparPor,
  ehConvertido,
  filtrarLeads,
  formatarTaxa,
  porTemperatura,
  taxa,
  useCrmMetrics,
  type PeriodoCustom,
  type PeriodoValue,
} from "@/hooks/useCrmMetrics";

const TODOS = "todos";

export default function DashboardMarketing() {
  const [periodo, setPeriodo] = useState<PeriodoValue>("30");
  const [custom, setCustom] = useState<PeriodoCustom>({ de: "", ate: "" });
  const [canal, setCanal] = useState(TODOS);
  const [anuncio, setAnuncio] = useState(TODOS);
  const { isLoading, error, leads, stageById } = useCrmMetrics();

  const opcoesCanal = useMemo(() => {
    const valores = [...new Set(leads.map((l) => l.contact?.canal).filter(Boolean) as string[])].sort();
    return [{ value: TODOS, label: "Todos os canais" }, ...valores.map((v) => ({ value: v, label: v }))];
  }, [leads]);

  const opcoesAnuncio = useMemo(() => {
    const valores = [...new Set(leads.map((l) => l.contact?.anuncio).filter(Boolean) as string[])].sort();
    return [{ value: TODOS, label: "Todos os anúncios" }, ...valores.map((v) => ({ value: v, label: v }))];
  }, [leads]);

  const m = useMemo(() => {
    const filtrados = filtrarLeads(leads, { periodo, custom, canal, anuncio });
    const convertidos = filtrados.filter((l) => ehConvertido(l, stageById)).length;
    return {
      total: filtrados.length,
      convertidos,
      conversao: taxa(convertidos, filtrados.length),
      temperaturas: porTemperatura(filtrados, stageById),
      porCanal: agruparPor(filtrados, stageById, (l) => l.contact?.canal),
      porAnuncio: agruparPor(filtrados, stageById, (l) => l.contact?.anuncio),
    };
  }, [leads, stageById, periodo, custom, canal, anuncio]);

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
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard de marketing</h1>
          <p className="text-sm text-muted-foreground">
            Volume e qualidade dos leads por canal e por anúncio.
          </p>
        </div>
        <div className="flex flex-wrap gap-4">
          <FiltroPeriodo
            periodo={periodo}
            onPeriodoChange={setPeriodo}
            custom={custom}
            onCustomChange={setCustom}
          />
          <FiltroSelect label="Canal" value={canal} onChange={setCanal} options={opcoesCanal} />
          <FiltroSelect label="Anúncio" value={anuncio} onChange={setAnuncio} options={opcoesAnuncio} />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Total de leads" value={m.total} />
        <MetricCard label="Conversões" value={m.convertidos} tone="positivo" />
        <MetricCard
          label="Taxa de conversão"
          value={formatarTaxa(m.conversao)}
          hint={canal === TODOS ? "Todos os canais" : canal}
          tone="positivo"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {m.temperaturas.map((t) => (
          <MetricCard
            key={t.temperatura}
            label={`${TEMPERATURA_LABELS[t.temperatura]}s`}
            value={t.total}
            hint={`${formatarTaxa(t.participacao)} dos leads · converte ${formatarTaxa(t.conversao)}`}
            tone={t.temperatura}
          />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <BarList
          title="Leads por canal"
          items={m.porCanal}
          emptyMessage="Nenhum lead no período selecionado."
          mostrarConversao
        />
        <BarList
          title="Leads por anúncio"
          items={m.porAnuncio}
          emptyMessage="Nenhum lead no período selecionado."
          mostrarConversao
        />
      </section>
    </div>
  );
}
