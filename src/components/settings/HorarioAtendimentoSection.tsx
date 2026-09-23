import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";
import {
  DIAS_SEMANA, HORARIO_PADRAO, type HorarioAtendimento,
  normalizarHorario,
} from "@/lib/orgSettings";

const HORAS = Array.from({ length: 25 }, (_, i) => i);
const rotulo = (h: number) => `${String(h).padStart(2, "0")}:00`;

export function HorarioAtendimentoSection() {
  const { orgId } = useOrg();
  const { toast } = useToast();
  const [horario, setHorario] = useState<HorarioAtendimento>(HORARIO_PADRAO);
  const [orgSettings, setOrgSettings] = useState<Record<string, unknown>>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!orgId) return;
    const { data } = await (supabase as any)
      .from("organizations").select("settings").eq("id", orgId).maybeSingle();
    const settings = (data?.settings as Record<string, unknown>) ?? {};
    setOrgSettings(settings);
    setHorario(normalizarHorario(settings.horario_atendimento));
    setCarregando(false);
  }, [orgId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const alterar = (indice: number, campo: keyof HorarioAtendimento[number], valor: boolean | number) => {
    setHorario((atual) =>
      atual.map((d, i) => {
        if (i !== indice) return d;
        const novo = { ...d, [campo]: valor };
        // Fechamento sempre depois da abertura.
        if (novo.fim <= novo.inicio) {
          if (campo === "inicio") novo.fim = Math.min(24, novo.inicio + 1);
          else novo.inicio = Math.max(0, novo.fim - 1);
        }
        return novo;
      }),
    );
  };

  const salvar = async () => {
    if (!orgId) return;
    setSalvando(true);
    const merged = { ...orgSettings, horario_atendimento: horario };
    const { error } = await (supabase as any)
      .from("organizations").update({ settings: merged }).eq("id", orgId);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      setOrgSettings(merged);
      toast({ title: "Horário de atendimento salvo" });
    }
    setSalvando(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4" /> Horário de atendimento
        </CardTitle>
        <CardDescription className="text-[10px]">
          Define a faixa de horas que a Agenda mostra. Fora desse intervalo, e nos dias
          fechados, a grade aparece sombreada — você ainda consegue agendar, mas fica
          visível que é fora do expediente.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {carregando ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border">
              {horario.map((d, i) => (
                <li key={DIAS_SEMANA[i]} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="flex min-w-[140px] items-center gap-2">
                    <Switch
                      checked={d.aberto}
                      onCheckedChange={(v) => alterar(i, "aberto", v)}
                      aria-label={DIAS_SEMANA[i]}
                    />
                    <Label className={d.aberto ? "text-xs" : "text-xs text-muted-foreground"}>
                      {DIAS_SEMANA[i]}
                    </Label>
                  </div>

                  {d.aberto ? (
                    <div className="flex items-center gap-2">
                      <Select value={String(d.inicio)} onValueChange={(v) => alterar(i, "inicio", Number(v))}>
                        <SelectTrigger className="h-8 w-[92px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {HORAS.slice(0, 24).map((h) => (
                            <SelectItem key={h} value={String(h)}>{rotulo(h)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">às</span>
                      <Select value={String(d.fim)} onValueChange={(v) => alterar(i, "fim", Number(v))}>
                        <SelectTrigger className="h-8 w-[92px] text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {HORAS.filter((h) => h > d.inicio).map((h) => (
                            <SelectItem key={h} value={String(h)}>{rotulo(h)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Fechado</span>
                  )}
                </li>
              ))}
            </ul>

            <Button size="sm" className="h-8 text-xs" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar horário"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
