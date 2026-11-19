"use client";

import { useState } from "react";
import { PO_STAGES } from "@/lib/apps/bill-forge/api";
import { Banner, Button, Input } from "@/components/ui";
import { Dialog } from "@/components/ui/Dialog";

/** Moving a purchase order by hand always asks why. The note is not decoration: it is
 *  the only record of a transition nobody can reconstruct from job history later. */
export function StageDialog({
  count,
  onCancel,
  onConfirm,
}: {
  count: number;
  onCancel: () => void;
  onConfirm: (stage: string, note: string) => Promise<void>;
}) {
  const [stage, setStage] = useState("bill_ready");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onConfirm(stage, note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not change the stage");
      setBusy(false);
    }
  }

  return (
    <Dialog
      size="lg"
      onClose={onCancel}
      title={`Move ${count} purchase order${count === 1 ? "" : "s"}`}
      description="This records what you assert, not what the app produced. Work done outside here is exactly what it is for — the note is what makes it readable later."
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30"
          >
            {PO_STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} — {s.hint}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Why</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            autoFocus
            placeholder="Imported into Zoho by hand on 8 Sep"
          />
        </label>

        {error && <Banner tone="danger">{error}</Banner>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !note.trim()}>
            {busy ? "Moving…" : "Move"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
