import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { useAnuncios, useContactsLite } from "@/hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TagPicker } from "./TagPicker";
import { CANAIS, TEMPERATURAS, type Temperatura } from "./constants";
import type { Stage } from "@/hooks/useLeads";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stages: Stage[];
  pipelineId: string | null;
  onCreated: () => void;
}

const EMPTY = {
  nome: "",
  telefone: "",
  email: "",
  canal: "",
  anuncio: "",
  temperatura: "morno" as Temperatura,
  valor: "",
  indicadoPor: "",
  stageId: "",
  dorRelatada: "",
};

const SEM_ANUNCIO = "sem-anuncio";

export function LeadCreateModal({ open, onOpenChange, stages, pipelineId, onCreated }: Props) {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: contacts = [] } = useContactsLite();
  const { data: anuncios = [] } = useAnuncios();
  const [form, setForm] = useState({ ...EMPTY });
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [openIndicado, setOpenIndicado] = useState(false);

  const defaultStage = useMemo(() => form.stageId || stages[0]?.id || "", [form.stageId, stages]);
  const indicadoLabel = contacts.find((c) => c.id === form.indicadoPor);

  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    if (!orgId || !pipelineId) return;
    if (!form.nome.trim()) {
      toast({ title: "Informe o nome do lead", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const [first, ...rest] = form.nome.trim().split(" ");
      const { data: contact, error: cErr } = await supabase
        .from("contacts")
        .insert({
          org_id: orgId,
          owner_id: user?.id ?? null,
          first_name: first,
          last_name: rest.join(" ") || null,
          phone: form.telefone || null,
          email: form.email || null,
          canal: form.canal || null,
          fonte: form.canal || null,
          anuncio: form.anuncio || null,
          temperatura: form.temperatura,
          indicado_por_contact_id: form.indicadoPor || null,
          status: "lead",
        })
        .select("id")
        .single();
      if (cErr || !contact) throw cErr;

      if (tagIds.length) {
        await supabase
          .from("contact_tags")
          .insert(tagIds.map((tag_id) => ({ org_id: orgId, contact_id: contact.id, tag_id })));
      }

      const { error: dErr } = await supabase.from("deals").insert({
        org_id: orgId,
        owner_id: user?.id ?? null,
        contact_id: contact.id,
        pipeline_id: pipelineId,
        stage_id: defaultStage || null,
        title: form.nome.trim(),
        dor_relatada: form.dorRelatada.trim() || null,
        value: form.valor ? Number(form.valor) : 0,
        currency: "BRL",
        status: "open",
      });
      if (dErr) throw dErr;

      toast({ title: "Lead criado com sucesso" });
      setForm({ ...EMPTY });
      setTagIds([]);
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro ao criar lead", description: err?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Lead</DialogTitle>
          <DialogDescription>Cadastre um novo lead no pipeline comercial.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome do lead" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.telefone} onChange={(e) => set({ telefone: e.target.value })} placeholder="(11) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Canal</Label>
              <Select value={form.canal} onValueChange={(v) => set({ canal: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar canal" /></SelectTrigger>
                <SelectContent>
                  {CANAIS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Temperatura</Label>
              <Select value={form.temperatura} onValueChange={(v) => set({ temperatura: v as Temperatura })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPERATURAS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Anúncio / criativo</Label>
            <Select
              value={form.anuncio || SEM_ANUNCIO}
              onValueChange={(v) => set({ anuncio: v === SEM_ANUNCIO ? "" : v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o anúncio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ANUNCIO}>Sem anúncio</SelectItem>
                {anuncios.map((a) => (
                  <SelectItem key={a.id} value={a.nome}>{a.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {anuncios.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum anúncio cadastrado. Crie a lista em Configurações → Anúncios.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Dor relatada</Label>
            <Textarea
              rows={3}
              value={form.dorRelatada}
              onChange={(e) => set({ dorRelatada: e.target.value })}
              placeholder="O que a pessoa falou, com as palavras dela. Ex: acorda cansada, ganhou 8kg no último ano, já tentou de tudo"
            />
            <p className="text-xs text-muted-foreground">
              Use na hora do retorno e do fechamento — é o que ela veio resolver.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagPicker selected={tagIds} onChange={setTagIds} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor estimado</Label>
              <Input type="number" min="0" step="0.01" value={form.valor} onChange={(e) => set({ valor: e.target.value })} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select value={defaultStage} onValueChange={(v) => set({ stageId: v })}>
                <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Indicado por</Label>
            <Popover open={openIndicado} onOpenChange={setOpenIndicado}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  {indicadoLabel
                    ? [indicadoLabel.first_name, indicadoLabel.last_name].filter(Boolean).join(" ")
                    : "Buscar contato..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                  <CommandInput placeholder="Buscar contato..." />
                  <CommandList>
                    <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem onSelect={() => { set({ indicadoPor: "" }); setOpenIndicado(false); }}>
                        Ninguém
                      </CommandItem>
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.first_name ?? ""} ${c.last_name ?? ""} ${c.phone ?? ""}`}
                          onSelect={() => { set({ indicadoPor: c.id }); setOpenIndicado(false); }}
                        >
                          {[c.first_name, c.last_name].filter(Boolean).join(" ") || "Sem nome"}
                          {c.phone && <span className="ml-2 text-xs text-muted-foreground">{c.phone}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving}>Criar lead</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
