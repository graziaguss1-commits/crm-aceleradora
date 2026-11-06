import { Copy, Link2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

/** Link de convite (cadastro só por convite): /?convite=<token> */
export const linkDoConvite = (token: string) => `${window.location.origin}/?convite=${token}`;

/**
 * Cria um convite da clínica e devolve o link. A regra de acesso do banco só
 * permite a dono/admin da clínica criar convite para a própria clínica.
 */
export async function criarConviteEquipe(orgId: string, email: string, role: string, invitedBy: string | null) {
  const { data, error } = await (supabase as any)
    .from("invitations")
    .insert({ org_id: orgId, email: email.trim().toLowerCase(), role, invited_by: invitedBy })
    .select("token")
    .single();
  if (error) throw error;
  return linkDoConvite(data.token as string);
}

export function ConviteLink({ email, link }: { email: string; link: string }) {
  const { toast } = useToast();
  const mensagem =
    `Olá! Você foi convidada para acessar o SISA da clínica.\n\n` +
    `Crie sua senha por este link:\n${link}\n\n` +
    `O link vale por 14 dias e funciona só com o e-mail ${email}.`;

  const copiar = async (texto: string, titulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: titulo });
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione o texto e copie manualmente.", variant: "destructive" });
    }
  };

  return (
    <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">
        Convite criado para <strong className="text-foreground">{email}</strong>. Envie o link abaixo; ele só pode ser usado uma vez.
      </p>
      <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs">{link}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copiar(link, "Link copiado")}>
          <Copy className="h-3.5 w-3.5" /> Copiar link
        </Button>
        <Button size="sm" className="gap-1.5" onClick={() => copiar(mensagem, "Mensagem copiada para o WhatsApp")}>
          <MessageCircle className="h-3.5 w-3.5" /> Copiar mensagem para WhatsApp
        </Button>
      </div>
    </div>
  );
}
