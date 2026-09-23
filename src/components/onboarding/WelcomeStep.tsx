import { Stethoscope, Calendar, Bot, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OnboardingStepProps } from "./types";

const features = [
  { icon: Calendar, label: "Agenda inteligente", desc: "Confirmações automáticas" },
  { icon: Bot, label: "IA Clínica", desc: "Resumo SOAP por Claude" },
  { icon: MessageSquare, label: "WhatsApp", desc: "Lembretes integrados" },
];

export function WelcomeStep({ userName, onNext }: OnboardingStepProps) {
  const firstName = userName?.split(" ")[0] || "usuário";

  return (
    <div className="text-center space-y-8 py-6">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
        <Stethoscope className="h-7 w-7 text-primary-foreground" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">
          Bem-vindo ao CRM Saúde, {firstName}! 👋
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Vamos configurar a sua clínica em menos de 5 minutos: você elimina o papel,
          automatiza confirmações e ganha um prontuário com IA. Pode pular qualquer integração e voltar nela em Configurações.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-sm mx-auto">
        {features.map((f) => (
          <div key={f.label} className="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/50 p-4">
            <f.icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium">{f.label}</span>
            <span className="text-xs text-muted-foreground">{f.desc}</span>
          </div>
        ))}
      </div>

      <Button size="lg" onClick={onNext} className="px-8">
        Vamos começar →
      </Button>
    </div>
  );
}
