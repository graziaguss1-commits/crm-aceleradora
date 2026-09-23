import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, useDroppable } from "@dnd-kit/core";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrg } from "@/hooks/useOrg";
import { useLeadsBoard, useTags } from "@/hooks/useLeads";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/crm/EmptyState";
import { Kanban, Plus } from "lucide-react";
import { LeadCard } from "@/components/leads/LeadCard";
import { LeadFilters, EMPTY_FILTERS, type LeadFilterState } from "@/components/leads/LeadFilters";
import { LeadCreateModal } from "@/components/leads/LeadCreateModal";
import { LeadDrawer } from "@/components/leads/LeadDrawer";
import { ObjecoesDialog } from "@/components/leads/ObjecoesDialog";
import { STAGE_BORDER_COLORS, STAGE_PERDIDO, formatCurrency, type Lead } from "@/components/leads/constants";

function StageColumn({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 rounded-md p-1 transition-colors ${isOver ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
    >
      {children}
    </div>
  );
}

export default function Pipeline() {
  const { orgId } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useLeadsBoard();
  const { data: tags = [] } = useTags();

  const [filters, setFilters] = useState<LeadFilterState>(EMPTY_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [pendingLoss, setPendingLoss] = useState<{ lead: Lead; stageId: string } | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const stages = data?.stages ?? [];
  const leads = data?.leads ?? [];
  const currency = data?.currency ?? "BRL";

  const leadParam = searchParams.get("lead");
  useEffect(() => {
    if (!leadParam) return;
    const found = (data?.leads ?? []).find((l) => l.id === leadParam);
    if (found) {
      setSelected(found);
      searchParams.delete("lead");
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadParam, data?.leads]);

  const anuncios = useMemo(
    () => Array.from(new Set(leads.map((l) => l.contact?.anuncio).filter(Boolean) as string[])).sort(),
    [leads],
  );
  const canaisExistentes = useMemo(
    () => Array.from(new Set(leads.map((l) => l.contact?.canal).filter(Boolean) as string[])).sort(),
    [leads],
  );

  const filtered = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const from = filters.from ? new Date(filters.from + "T00:00:00").getTime() : null;
    const to = filters.to ? new Date(filters.to + "T23:59:59").getTime() : null;

    return leads.filter((l) => {
      const c = l.contact;
      if (search) {
        const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ").toLowerCase();
        const phone = (c?.phone ?? "").toLowerCase();
        if (!name.includes(search) && !phone.includes(search) && !l.title.toLowerCase().includes(search)) return false;
      }
      if (filters.temperaturas.length && !filters.temperaturas.includes(c?.temperatura ?? "")) return false;
      if (filters.canais.length && !filters.canais.includes(c?.canal ?? "")) return false;
      if (filters.anuncios.length && !filters.anuncios.includes(c?.anuncio ?? "")) return false;
      if (filters.tagIds.length) {
        const ids = l.tags.map((t) => t.id);
        if (!filters.tagIds.every((id) => ids.includes(id))) return false;
      }
      const created = new Date(l.created_at).getTime();
      if (from && created < from) return false;
      if (to && created > to) return false;
      return true;
    });
  }, [leads, filters]);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages) map.set(s.id, []);
    for (const l of filtered) {
      if (l.stage_id && map.has(l.stage_id)) map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [stages, filtered]);

  const moveLead = async (leadId: string, stageId: string) => {
    const { error } = await supabase.from("deals").update({ stage_id: stageId }).eq("id", leadId);
    if (error) {
      toast({ title: "Erro ao mover lead", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["leads-board"] });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const leadId = String(event.active.id);
    const stageId = event.over ? String(event.over.id) : null;
    if (!stageId) return;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === stageId) return;

    const stage = stages.find((s) => s.id === stageId);
    if (stage?.name === STAGE_PERDIDO) {
      setPendingLoss({ lead, stageId });
      return;
    }
    void moveLead(leadId, stageId);
  };

  const confirmLoss = async (objecaoIds: string[]) => {
    if (!pendingLoss || !orgId) return;
    const { lead, stageId } = pendingLoss;
    const { error } = await supabase
      .from("deals")
      .update({ stage_id: stageId, status: "lost" })
      .eq("id", lead.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("deal_objecoes").upsert(
      objecaoIds.map((objecao_id) => ({
        org_id: orgId,
        deal_id: lead.id,
        objecao_id,
        created_by: user?.id ?? null,
      })),
      { onConflict: "deal_id,objecao_id", ignoreDuplicates: true },
    );
    setPendingLoss(null);
    toast({ title: "Lead marcado como perdido" });
    qc.invalidateQueries({ queryKey: ["leads-board"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <Kanban className="h-6 w-6 text-primary" /> Pipeline de Leads
          </h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe a jornada comercial dos leads da clínica.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Lead
        </Button>
      </div>

      <LeadFilters
        filters={filters}
        onChange={setFilters}
        tags={tags}
        anuncios={anuncios}
        canais={canaisExistentes}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-64 animate-pulse rounded-lg bg-muted/40" />)}
        </div>
      ) : stages.length === 0 ? (
        <EmptyState
          icon={<Kanban className="h-6 w-6 text-muted-foreground" />}
          title="Pipeline não configurado"
          description="Não foi possível carregar as etapas do pipeline comercial."
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stages.map((stage, idx) => {
              const items = byStage.get(stage.id) ?? [];
              const total = items.reduce((sum, l) => sum + Number(l.value ?? 0), 0);
              return (
                <div key={stage.id} className="w-72 shrink-0">
                  <Card className={`border-t-4 ${STAGE_BORDER_COLORS[idx % STAGE_BORDER_COLORS.length]} bg-muted/30 p-3`}>
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">{stage.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {items.length} {items.length === 1 ? "lead" : "leads"}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-xs">{formatCurrency(total, currency)}</Badge>
                    </div>
                    <StageColumn id={stage.id}>
                      <div className="max-h-[calc(100vh-320px)] space-y-2 overflow-y-auto">
                        {items.length === 0 ? (
                          <p className="py-6 text-center text-xs text-muted-foreground">Sem leads nesta etapa</p>
                        ) : (
                          items.map((lead) => (
                            <LeadCard key={lead.id} lead={lead} currency={currency} onClick={() => setSelected(lead)} />
                          ))
                        )}
                      </div>
                    </StageColumn>
                  </Card>
                </div>
              );
            })}
          </div>
        </DndContext>
      )}

      <LeadCreateModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        stages={stages}
        pipelineId={data?.pipelineId ?? null}
        onCreated={() => qc.invalidateQueries({ queryKey: ["leads-board"] })}
      />

      <LeadDrawer
        lead={selected ? leads.find((l) => l.id === selected.id) ?? selected : null}
        stages={stages}
        currency={currency}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onChanged={() => {}}
      />

      <ObjecoesDialog
        open={!!pendingLoss}
        onOpenChange={(o) => !o && setPendingLoss(null)}
        onConfirm={confirmLoss}
        onCancel={() => setPendingLoss(null)}
      />
    </div>
  );
}
