import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Filter, X, ChevronDown } from "lucide-react";
import { CANAIS, TAG_CATEGORIA_LABELS, TEMPERATURAS, type LeadTag, type TagCategoria } from "./constants";

export interface LeadFilterState {
  search: string;
  tagIds: string[];
  temperaturas: string[];
  canais: string[];
  anuncios: string[];
  from: string;
  to: string;
}

export const EMPTY_FILTERS: LeadFilterState = {
  search: "",
  tagIds: [],
  temperaturas: [],
  canais: [],
  anuncios: [],
  from: "",
  to: "",
};

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function MultiSelect({
  label,
  count,
  children,
  width = "w-64",
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between gap-2">
          {label}
          {count > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{count}</Badge>}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={`${width} p-0`}>
        <ScrollArea className="max-h-72">
          <div className="p-2 space-y-1">{children}</div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex-1 truncate">{children}</span>
    </label>
  );
}

interface Props {
  filters: LeadFilterState;
  onChange: (f: LeadFilterState) => void;
  tags: LeadTag[];
  anuncios: string[];
  canais?: string[];
}

export function LeadFilters({ filters, onChange, tags, anuncios, canais }: Props) {
  const set = (patch: Partial<LeadFilterState>) => onChange({ ...filters, ...patch });

  const canalOptions = Array.from(new Set([...(canais ?? []), ...CANAIS]));

  const grouped = tags.reduce<Record<string, LeadTag[]>>((acc, tag) => {
    const key = tag.categoria || "geral";
    (acc[key] ||= []).push(tag);
    return acc;
  }, {});

  const activeCount =
    filters.tagIds.length +
    filters.temperaturas.length +
    filters.canais.length +
    filters.anuncios.length +
    (filters.from ? 1 : 0) +
    (filters.to ? 1 : 0) +
    (filters.search ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Buscar por nome ou telefone..."
          className="h-9 pl-8"
        />
      </div>

      <MultiSelect label="Tags" count={filters.tagIds.length}>
        {tags.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhuma tag criada</p>}
        {Object.entries(grouped).map(([categoria, list]) => (
          <div key={categoria} className="mb-1">
            <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {TAG_CATEGORIA_LABELS[categoria as TagCategoria] ?? categoria}
            </p>
            {list.map((tag) => (
              <CheckRow
                key={tag.id}
                checked={filters.tagIds.includes(tag.id)}
                onChange={() => set({ tagIds: toggle(filters.tagIds, tag.id) })}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: tag.color ?? "#64748b" }} />
                  {tag.name}
                </span>
              </CheckRow>
            ))}
          </div>
        ))}
      </MultiSelect>

      <MultiSelect label="Temperatura" count={filters.temperaturas.length} width="w-48">
        {TEMPERATURAS.map((t) => (
          <CheckRow
            key={t.value}
            checked={filters.temperaturas.includes(t.value)}
            onChange={() => set({ temperaturas: toggle(filters.temperaturas, t.value) })}
          >
            {t.label}
          </CheckRow>
        ))}
      </MultiSelect>

      <MultiSelect label="Canal" count={filters.canais.length} width="w-56">
        {canalOptions.map((c) => (
          <CheckRow
            key={c}
            checked={filters.canais.includes(c)}
            onChange={() => set({ canais: toggle(filters.canais, c) })}
          >
            {c}
          </CheckRow>
        ))}
      </MultiSelect>

      <MultiSelect label="Anúncio" count={filters.anuncios.length} width="w-80">
        {anuncios.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum anúncio registrado</p>
        )}
        {anuncios.map((a) => (
          <CheckRow
            key={a}
            checked={filters.anuncios.includes(a)}
            onChange={() => set({ anuncios: toggle(filters.anuncios, a) })}
          >
            {a}
          </CheckRow>
        ))}
      </MultiSelect>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Período
            {(filters.from || filters.to) && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">1</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Criado de</Label>
            <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Criado até</Label>
            <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} />
          </div>
        </PopoverContent>
      </Popover>

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} className="gap-1 text-muted-foreground">
          <X className="h-3.5 w-3.5" /> Limpar
        </Button>
      )}
    </div>
  );
}
