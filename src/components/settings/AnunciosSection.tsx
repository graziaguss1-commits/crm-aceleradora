import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Megaphone } from "lucide-react";
import { CANAIS } from "@/components/leads/constants";

export interface Anuncio {
  id: string;
  nome: string;
  canal: string | null;
  ativo: boolean;
}

const SEM_CANAL = "sem-canal";

export function AnunciosSection() {
  const { orgId } = useOrg();
  const { toast } = useToast();

  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState("");
  const [novoCanal, setNovoCanal] = useState(SEM_CANAL);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const { data } = await (supabase as any)
      .from("anuncios").select("id,nome,canal,ativo")
      .eq("org_id", orgId).order("nome");
    setAnuncios((data ?? []) as Anuncio[]);
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const criar = async () => {
    const nome = novoNome.trim();
    if (!orgId || !nome) return;
    setSalvando(true);
    try {
      const { error } = await (supabase as any).from("anuncios").insert({
        org_id: orgId, nome, canal: novoCanal === SEM_CANAL ? null : novoCanal,
      });
      if (error) {
        if (error.code === "23505") {
          toast({ title: "Esse anúncio já existe", description: nome, variant: "destructive" });
        } else throw error;
      } else {
        setNovoNome(""); setNovoCanal(SEM_CANAL);
        void carregar();
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const alternarAtivo = async (a: Anuncio) => {
    const { error } = await (supabase as any)
      .from("anuncios").update({ ativo: !a.ativo }).eq("id", a.id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    void carregar();
  };

  const remover = async (a: Anuncio) => {
    if (!window.confirm(`Excluir o anúncio "${a.nome}"? Os leads que já vieram por ele mantêm o registro.`)) return;
    const { error } = await (supabase as any).from("anuncios").delete().eq("id", a.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    void carregar();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="h-4 w-4" /> Anúncios
        </CardTitle>
        <CardDescription>
          A lista que aparece no cadastro de lead. Desative um anúncio para tirá-lo das
          opções sem perder o histórico de quem já veio por ele.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1 space-y-1.5">
            <Label>Nome do anúncio</Label>
            <Input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void criar(); }}
              placeholder='Ex: "Tenho interesse no tratamento da menopausa"'
            />
          </div>
          <div className="space-y-1.5">
            <Label>Canal</Label>
            <Select value={novoCanal} onValueChange={setNovoCanal}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_CANAL}>Sem canal</SelectItem>
                {CANAIS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={criar} disabled={!novoNome.trim() || salvando}>
            <Plus className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : anuncios.length === 0 ? (
          <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            Nenhum anúncio cadastrado. Adicione o primeiro acima.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {anuncios.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={a.ativo ? "truncate text-sm" : "truncate text-sm text-muted-foreground line-through"}>
                    {a.nome}
                  </p>
                  {a.canal && <p className="text-xs text-muted-foreground">{a.canal}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={a.ativo} onCheckedChange={() => alternarAtivo(a)} aria-label="Ativo" />
                  <Button variant="ghost" size="icon" onClick={() => remover(a)} aria-label="Excluir">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
