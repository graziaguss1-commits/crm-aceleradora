import { useDraggable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Phone, CalendarClock } from "lucide-react";
import { formatCurrency, isOverdue, leadName, TEMPERATURAS, type Lead } from "./constants";

export function TemperaturaBadge({ value }: { value?: string | null }) {
  const t = TEMPERATURAS.find((x) => x.value === value);
  if (!t) return null;
  return (
    <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-medium ${t.className}`}>
      {t.label}
    </Badge>
  );
}

export function LeadCard({
  lead,
  currency,
  onClick,
}: {
  lead: Lead;
  currency: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  const visibleTags = lead.tags.filter((t) => t.categoria === "interesse" || t.categoria === "anuncio");
  const next = lead.nextFollowUp;
  const overdue = isOverdue(next?.data_agendada);

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`cursor-grab rounded-md border bg-background p-3 text-left shadow-sm transition-colors hover:bg-accent/50 ${
        isDragging ? "z-50 opacity-80 shadow-lg" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2">{leadName(lead)}</p>
        <TemperaturaBadge value={lead.contact?.temperatura} />
      </div>

      {lead.dor_relatada && (
        <p className="mt-1.5 line-clamp-2 border-l-2 border-primary/30 pl-2 text-xs italic text-muted-foreground">
          {lead.dor_relatada}
        </p>
      )}

      {lead.contact?.phone && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" /> {lead.contact.phone}
        </p>
      )}

      {visibleTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {visibleTags.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className="rounded-full border px-1.5 py-0.5 text-[10px]"
              style={{ borderColor: (t.color ?? "#64748b") + "66", color: t.color ?? undefined }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-primary">
          {formatCurrency(Number(lead.value ?? 0), currency)}
        </span>
        {next && (
          <span
            className={`flex items-center gap-1 text-[10px] ${
              overdue ? "font-semibold text-destructive" : "text-muted-foreground"
            }`}
          >
            <CalendarClock className="h-3 w-3" />
            {new Date(next.data_agendada).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
