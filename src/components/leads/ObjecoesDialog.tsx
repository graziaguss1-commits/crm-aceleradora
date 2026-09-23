import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useObjecoes } from "@/hooks/useLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (objecaoIds: string[]) => Promise<void> | void;
  onCancel?: () => void;
}

export function ObjecoesDialog({ open, onOpenChange, onConfirm, onCancel }: Props) {
  const { data: objecoes = [] } = useObjecoes();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const submit = async () => {
    if (!selected.length) return;
    setSaving(true);
    try {
      await onConfirm(selected);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel?.();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Por que o lead foi perdido?</DialogTitle>
          <DialogDescription>Selecione ao menos uma objeção para registrar a perda.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {objecoes.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={selected.includes(o.id)}
                onCheckedChange={() =>
                  setSelected((prev) => (prev.includes(o.id) ? prev.filter((id) => id !== o.id) : [...prev, o.id]))
                }
              />
              <span className="h-2 w-2 rounded-full" style={{ background: o.color ?? "#ef4444" }} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onCancel?.(); onOpenChange(false); }}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!selected.length || saving}>
            Confirmar perda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
