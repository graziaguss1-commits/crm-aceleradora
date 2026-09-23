import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, Mail, BookOpen } from "lucide-react";
import { FAQ_CATEGORIES } from "./faq-content";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function HelpCenter({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES.map((c) => ({
      ...c,
      items: c.items.filter(
        (i) => i.q.toLowerCase().includes(q) || i.a.toLowerCase().includes(q),
      ),
    })).filter((c) => c.items.length > 0);
  }, [query]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Central de Ajuda
          </SheetTitle>
          <SheetDescription>
            Tire suas dúvidas sobre como usar a plataforma.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar na ajuda..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum resultado para "{query}".
            </p>
          ) : (
            <Accordion type="multiple" className="space-y-3">
              {filtered.map((cat) => (
                <div key={cat.id}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {cat.title}
                  </p>
                  {cat.items.map((item, idx) => (
                    <AccordionItem
                      key={`${cat.id}-${idx}`}
                      value={`${cat.id}-${idx}`}
                      className="border border-border rounded-md mb-1.5 px-3"
                    >
                      <AccordionTrigger className="text-sm py-2.5 hover:no-underline text-left">
                        {item.q}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </div>
              ))}
            </Accordion>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 text-xs text-muted-foreground flex items-center justify-between">
          <span>Não encontrou? Fale com o suporte:</span>
          <a
            href="mailto:suporte@flowcrm.com.br"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Mail className="h-3 w-3" /> suporte@flowcrm.com.br
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
