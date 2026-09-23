import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useTags } from "@/hooks/useLeads";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import { TAG_CATEGORIAS_DISPONIVEIS, TAG_CATEGORIA_LABELS, TAG_COLORS, type LeadTag, type TagCategoria } from "./constants";

export function TagChip({ tag, onRemove }: { tag: LeadTag; onRemove?: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
      style={{ borderColor: (tag.color ?? "#64748b") + "66", color: tag.color ?? undefined }}
    >
      {tag.name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="opacity-60 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export function TagPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const { orgId } = useOrg();
  const { data: tags = [] } = useTags();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newCategoria, setNewCategoria] = useState<TagCategoria>("interesse");
  const [creating, setCreating] = useState(false);

  const grouped = tags.reduce<Record<string, LeadTag[]>>((acc, t) => {
    const key = t.categoria || "geral";
    (acc[key] ||= []).push(t);
    return acc;
  }, {});

  const createTag = async () => {
    const name = newName.trim();
    if (!name || !orgId) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("tags")
      .insert({
        org_id: orgId,
        name,
        categoria: newCategoria,
        color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
      })
      .select("id,name,color,categoria")
      .single();
    setCreating(false);
    if (error || !data) return;
    setNewName("");
    await qc.invalidateQueries({ queryKey: ["lead-tags"] });
    onChange([...selected, data.id]);
  };

  const selectedTags = tags.filter((t) => selected.includes(t.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => onChange(selected.filter((id) => id !== t.id))} />
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
              <TagIcon className="h-3 w-3" /> Tags
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-0">
            <ScrollArea className="max-h-60">
              <div className="p-2">
                {tags.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma tag ainda</p>
                )}
                {Object.entries(grouped).map(([categoria, list]) => (
                  <div key={categoria} className="mb-1">
                    <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {TAG_CATEGORIA_LABELS[categoria as TagCategoria] ?? categoria}
                    </p>
                    {list.map((t) => (
                      <label
                        key={t.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          checked={selected.includes(t.id)}
                          onCheckedChange={() =>
                            onChange(
                              selected.includes(t.id)
                                ? selected.filter((id) => id !== t.id)
                                : [...selected, t.id],
                            )
                          }
                        />
                        <span className="h-2 w-2 rounded-full" style={{ background: t.color ?? "#64748b" }} />
                        <span className="flex-1 truncate">{t.name}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="space-y-2 border-t p-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nova tag..."
                className="h-8"
              />
              <div className="flex gap-2">
                <Select value={newCategoria} onValueChange={(v) => setNewCategoria(v as TagCategoria)}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_CATEGORIAS_DISPONIVEIS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {TAG_CATEGORIA_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" className="h-8" disabled={creating || !newName.trim()} onClick={createTag}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
