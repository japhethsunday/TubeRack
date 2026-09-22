"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/src/components/ui/overlays";
import { Button } from "@/src/components/ui/Button";
import { Input, Textarea } from "@/src/components/ui/fields";
import { InfoLine } from "@/src/components/ui/Toast";

/**
 * New-project dialog (visual foundation). Fields are fully interactive so the
 * UX can be validated, but creation stays disabled with its reason until
 * project persistence ships in Phase 4 — never a fake save.
 */
export function NewProjectButton({ label = "New video" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Button>
      {open && (
        <Modal
          title="New project"
          description="Start from an idea — research, script, and production attach to it later."
          onClose={() => setOpen(false)}
          wide
        >
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <Input label="Working title" placeholder="e.g. Why hooks fail in the first 8 seconds" />
            <Textarea label="Core idea" rows={3} placeholder="One or two sentences on the angle…" />
            <Input label="Target audience" placeholder="e.g. New YouTubers under 10k subs" />
            <InfoLine>
              Project persistence arrives in Phase 4. Nothing here is stored
              yet — that is why creation is disabled.
            </InfoLine>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled title="Saving arrives in Phase 4">
                Create project
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
