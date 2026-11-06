import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Loader2, MessageCircle, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useClinicaAcesso } from "@/hooks/useClinicaAcesso";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Painel da administração do SISA (só para platform_admins).
 * Libera clínicas por convite, gera novo link e ativa/desativa o acesso.
 * Mostra só cadastro e contagens: nenhum dado de lead ou paciente.
 */

interface Clinica {
  id: string;
  nome: string;
  ativa: boolean;
  criada_em: string;
  donos: string | null;
  usuarios: number;
  convites_pendentes: number;
  leads_30d: number;
}

interface ConviteGerado {
  clinica: string;
  email: string;
  link: string;
}

const linkDoConvite = (token: string) => `${window.location.origin}/?convite=${token}`;

const mensagemWhatsApp = (c: ConviteGerado) =>
  `Olá! O acesso da ${c.clinica} ao SISA está liberado.\n\n` +
  `Crie sua senha por este link:\n${c.link}\n\n` +
  `O link vale por 30 dias e funciona só com o e-mail ${c.email}.`;

export default function AdminClinicas() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const acesso = useClinicaAcesso();

  const clinicas = useQuery({
    queryKey: ["admin-clinicas"],
    enabled: acesso.data?.admin === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_listar_clinicas");
      if (error) throw error;
      return (data ?? []) as Clinica[];
    },
  });

  const [nome, setNome] = useState("");
  const [emailDono, setEmailDono] = useState("");
  const [criando, setCriando] = useState(false);
  const [convite, setConvite] = useState<ConviteGerado | null>(null);

  const [novoConvitePara, setNovoConvitePara] = useState<Clinica | null>(null);
  const [emailNovoConvite, setEmailNovoConvite] = useState("");
  const [gerando, setGerando] = useState(false);

  const [mudarSituacao, setMudarSituacao] = useState<Clinica | null>(null);

  const copiar = async (texto: string, titulo: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: titulo });
    } catch {
      toast({ title: "Não foi possível copiar", description: "Selecione o texto e copie manualmente.", variant: "destructive" });
    }
  };

  const liberar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    const { data, error } = await (supabase as any).rpc("admin_criar_clinica", { p_nome: nome, p_email_dono: emailDono });
    setCriando(false);
    if (error) {
      toast({ title: "Não foi possível liberar", description: error.message, variant: "destructive" });
      return;
    }
    setConvite({ clinica: nome.trim(), email: emailDono.trim().toLowerCase(), link: linkDoConvite(data.token) });
    setNome("");
    setEmailDono("");
    qc.invalidateQueries({ queryKey: ["admin-clinicas"] });
  };

  const gerarNovoConvite = async () => {
    if (!novoConvitePara) return;
    setGerando(true);
    const { data, error } = await (supabase as any).rpc("admin_gerar_convite", {
      p_org: novoConvitePara.id,
      p_email: emailNovoConvite,
    });
    setGerando(false);
    if (error) {
      toast({ title: "Não foi possível gerar o convite", description: error.message, variant: "destructive" });
      return;
    }
    setConvite({ clinica: novoConvitePara.nome, email: emailNovoConvite.trim().toLowerCase(), link: linkDoConvite(data as string) });
    setNovoConvitePara(null);
    qc.invalidateQueries({ queryKey: ["admin-clinicas"] });
  };

  const confirmarSituacao = async () => {
    if (!mudarSituacao) return;
    const { error } = await (supabase as any).rpc("admin_definir_ativa", {
      p_org: mudarSituacao.id,
      p_ativa: !mudarSituacao.ativa,
    });
    if (error) {
      toast({ title: "Não foi possível alterar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: mudarSituacao.ativa ? "Clínica desativada" : "Clínica reativada" });
    }
    setMudarSituacao(null);
    qc.invalidateQueries({ queryKey: ["admin-clinicas"] });
  };

  if (acesso.isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!acesso.data?.admin) {
    return (
      <div className="p-6">
        <p className="eyebrow text-[11px]">Administração SISA</p>
        <h1 className="mt-1 text-2xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">Esta área é só da administração do SISA.</p>
      </div>
    );
  }

  const lista = clinicas.data ?? [];
  const ativas = lista.filter((c) => c.ativa).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header>
        <p className="eyebrow text-[11px]">Administração SISA</p>
        <h1 className="mt-0.5 text-2xl font-bold">Clínicas</h1>
        <p className="text-sm text-muted-foreground">
          Libere o acesso de cada clínica que entrou na Aceleradora. Cada uma vê só os próprios dados.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card className="p-6">
          <p className="eyebrow text-[11px]">Nova clínica</p>
          <h2 className="mt-0.5 text-lg font-bold">Liberar acesso</h2>
          <form onSubmit={liberar} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome-clinica">Nome da clínica</Label>
              <Input id="nome-clinica" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Clínica Bem Estar" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-dono">E-mail do dono</Label>
              <Input id="email-dono" type="email" value={emailDono} onChange={(e) => setEmailDono(e.target.value)} placeholder="dono@clinica.com.br" required />
              <p className="text-xs text-muted-foreground">O convite só funciona com este e-mail. Depois o dono convida a secretária pela tela Equipe.</p>
            </div>
            <Button type="submit" disabled={criando} className="w-full gap-2">
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Liberar clínica e gerar convite
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <p className="eyebrow text-[11px]">Convite</p>
          <h2 className="mt-0.5 text-lg font-bold">{convite ? convite.clinica : "Link de acesso"}</h2>
          {convite ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Mande para <strong className="text-foreground">{convite.email}</strong>. O link vale por 30 dias e só pode ser usado uma vez.
              </p>
              <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-mono text-xs">{convite.link}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={() => copiar(convite.link, "Link copiado")}>
                  <Copy className="h-4 w-4" /> Copiar link
                </Button>
                <Button className="gap-2" onClick={() => copiar(mensagemWhatsApp(convite), "Mensagem copiada para o WhatsApp")}>
                  <MessageCircle className="h-4 w-4" /> Copiar mensagem para WhatsApp
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Quando você liberar uma clínica ou gerar um novo convite, o link aparece aqui pronto para enviar.
            </p>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-end justify-between px-6 pt-5 pb-3">
          <div>
            <p className="eyebrow text-[11px]">Clínicas no SISA</p>
            <h2 className="mt-0.5 text-lg font-bold">{lista.length} {lista.length === 1 ? "clínica" : "clínicas"} · {ativas} {ativas === 1 ? "ativa" : "ativas"}</h2>
          </div>
        </div>
        {clinicas.isLoading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border bg-muted/40">
                  {["Clínica", "Dono", "Usuários", "Convites pendentes", "Leads 30 dias", "Situação", ""].map((h) => (
                    <th key={h} className="eyebrow px-4 py-2 text-left text-[10px] font-normal first:pl-6 last:pr-6">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="py-3 pl-6 pr-4">
                      <p className="font-semibold">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">desde {new Date(c.criada_em).toLocaleDateString("pt-BR")}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.donos ?? "aguardando o dono aceitar"}</td>
                    <td className="px-4 py-3 tabular-nums">{c.usuarios}</td>
                    <td className="px-4 py-3 tabular-nums">{c.convites_pendentes}</td>
                    <td className="px-4 py-3 tabular-nums">{c.leads_30d}</td>
                    <td className="px-4 py-3">
                      {c.ativa ? <Badge className="bg-success text-success-foreground hover:bg-success">Ativa</Badge> : <Badge variant="outline">Desativada</Badge>}
                    </td>
                    <td className="py-3 pl-4 pr-6">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => { setNovoConvitePara(c); setEmailNovoConvite(c.donos?.split(",")[0]?.trim() ?? ""); }}>
                          Novo convite
                        </Button>
                        <Button size="sm" variant={c.ativa ? "ghost" : "default"} onClick={() => setMudarSituacao(c)}>
                          {c.ativa ? "Desativar" : "Reativar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={!!novoConvitePara} onOpenChange={(o) => !o && setNovoConvitePara(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo convite para {novoConvitePara?.nome}</DialogTitle>
            <DialogDescription>
              Gera um link de dono para este e-mail. Use quando o link anterior venceu ou quando a clínica trocar de responsável.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="email-novo-convite">E-mail</Label>
            <Input id="email-novo-convite" type="email" value={emailNovoConvite} onChange={(e) => setEmailNovoConvite(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoConvitePara(null)}>Cancelar</Button>
            <Button onClick={gerarNovoConvite} disabled={gerando || !emailNovoConvite.trim()}>
              {gerando ? "Gerando..." : "Gerar convite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!mudarSituacao} onOpenChange={(o) => !o && setMudarSituacao(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mudarSituacao?.ativa ? "Desativar" : "Reativar"} {mudarSituacao?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              {mudarSituacao?.ativa
                ? "A equipe da clínica perde o acesso aos dados na hora e passa a ver a tela de acesso suspenso. Nada é apagado: ao reativar, tudo volta como estava."
                : "A equipe da clínica volta a acessar o SISA com todos os dados como estavam."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarSituacao}>
              {mudarSituacao?.ativa ? "Desativar" : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
