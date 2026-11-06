import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { RouteTransition } from "@/components/RouteTransition";
import { CommandPalette } from "@/components/CommandPalette";
import { AICopilot } from "@/components/crm/AICopilot";
import { OnboardingChecklist } from "@/components/crm/OnboardingChecklist";
import { OnboardingModal } from "@/components/onboarding/OnboardingModal";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useClinicaAcesso } from "@/hooks/useClinicaAcesso";
import { Button } from "@/components/ui/button";

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, loading, signOut } = useAuth();
  const acesso = useClinicaAcesso();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/");
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  // Clínica desativada ou usuário removido da clínica: o banco já bloqueia os
  // dados; aqui só explicamos o motivo em vez de mostrar telas vazias.
  const sit = acesso.data?.situacao;
  if (sit && (!sit.tem_clinica || !sit.ativa) && !acesso.data?.admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-[1.375rem] border bg-card p-8 text-center shadow-card">
          <p className="eyebrow text-[11px]">SISA</p>
          <h1 className="mt-1 text-2xl font-bold">Acesso suspenso</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {sit.tem_clinica
              ? `O acesso da ${sit.nome ?? "sua clínica"} ao SISA está suspenso no momento. Fale com a administração do SISA para reativar.`
              : "Sua conta não está ligada a nenhuma clínica. Peça um novo convite ao responsável pela sua clínica."}
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <AppHeader onOpenSearch={() => setSearchOpen(true)} />
          <main className="flex-1 p-3 sm:p-6 pb-20 md:pb-6">
            <RouteTransition />
          </main>
        </div>
      </div>
      {isMobile && <MobileBottomNav />}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <AICopilot />
      <OnboardingChecklist />
      <OnboardingModal />
    </SidebarProvider>
  );
}
