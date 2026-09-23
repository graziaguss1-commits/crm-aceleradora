import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Sparkles, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { countDemoData, generateDemoData, removeDemoData } from "@/lib/demoData";

interface Props {
  orgId: string | null;
  userId: string | undefined;
}

export function DemoDataSection({ orgId, userId }: Props) {
  const [counts, setCounts] = useState<Awaited<ReturnType<typeof countDemoData>> | null>(null);
  const [generating, setGenerating] = useState(false);
  const [removing, setRemoving] = useState(false);

  const refresh = async () => {
    if (!orgId) return;
    try {
      setCounts(await countDemoData(orgId));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const total = counts
    ? counts.patients + counts.activities + counts.payments + counts.medical_records +
      counts.professionals + counts.health_goals + counts.contacts + counts.companies +
      counts.deals + counts.pipelines + counts.tags
    : 0;

  const handleGenerate = async () => {
    if (!orgId || !userId) return;
    setGenerating(true);
    try {
      const res = await generateDemoData(orgId, userId);
      toast.success("Dados de demonstração criados", {
        description: `${res.patients} pacientes, ${res.appointments} consultas, ${res.payments} pagamentos, ${res.tasks} tarefas.`,
      });
      await refresh();
    } catch (e: any) {
      toast.error("Erro ao gerar dados", { description: e.message });
    } finally {
      setGenerating(false);
    }
  };

  const handleRemove = async () => {
    if (!orgId) return;
    setRemoving(true);
    try {
      await removeDemoData(orgId);
      toast.success("Dados de demonstração removidos");
      await refresh();
    } catch (e: any) {
      toast.error("Erro ao remover", { description: e.message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>Gerar dados de demonstração</CardTitle>
          </div>
          <CardDescription>
            Popule o CRM com um cenário realista de clínica para testar agenda, prontuários, financeiro e relatórios.
            Todos os registros são marcados com <Badge variant="outline" className="mx-1">[DEMO]</Badge> e podem ser removidos a qualquer momento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Médicos" value={4} />
            <Stat label="Pacientes" value={10} />
            <Stat label="Consultas" value={24} />
            <Stat label="Prontuários" value={10} />
            <Stat label="Pagamentos" value={13} />
            <Stat label="Metas" value={4} />
            <Stat label="CRM (deals)" value={6} />
            <Stat label="Tarefas" value={5} />
          </div>
          <Button onClick={handleGenerate} disabled={generating || !orgId || !userId}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar dados fictícios
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <CardTitle>Limpar dados de demonstração</CardTitle>
          </div>
          <CardDescription>
            Remove apenas registros marcados com [DEMO]. Seus dados reais não serão afetados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {counts && (
            <div className="text-sm text-muted-foreground">
              Atualmente: <strong className="text-foreground">{total}</strong> registros de demonstração na sua conta
              {total > 0 && ` (${counts.professionals} médicos, ${counts.patients} pacientes, ${counts.activities} atividades, ${counts.medical_records} prontuários, ${counts.payments} pagamentos, ${counts.health_goals} metas, ${counts.contacts} contatos, ${counts.companies} empresas, ${counts.deals} negócios, ${counts.tags} tags)`}.
            </div>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={removing || total === 0}>
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover dados fictícios
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover todos os dados de demonstração?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação remove permanentemente todos os {total} registros marcados com [DEMO].
                  Seus dados reais permanecerão intactos. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleRemove}>Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
