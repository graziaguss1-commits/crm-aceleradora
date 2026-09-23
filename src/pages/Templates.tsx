import { Card } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function Templates() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="text-muted-foreground">
          Modelos reutilizáveis de mensagens, lembretes e prontuários.
        </p>
      </div>

      <Card className="p-12">
        <div className="flex flex-col items-center justify-center text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">Em breve</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Estamos preparando a biblioteca de templates para mensagens de WhatsApp,
            confirmações de consulta e prontuários padronizados.
          </p>
        </div>
      </Card>
    </div>
  );
}
