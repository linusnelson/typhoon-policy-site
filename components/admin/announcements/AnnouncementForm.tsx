"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Banner, Button, Card, Input, Textarea } from "@/components/ui";
import { PolicyMarkdown } from "@/components/PolicyMarkdown";
import { idleState } from "@/lib/action-utils";
import { createAnnouncement, updateAnnouncement } from "@/actions/announcements";
import type { Announcement } from "@/lib/types";

const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400";

function SubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending
        ? "Saving…"
        : editing
          ? "Save changes"
          : "Publish & notify everyone"}
    </Button>
  );
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnnouncementForm({
  announcement,
  onClose,
}: {
  announcement?: Announcement; // present = edit
  onClose?: () => void;
}) {
  const editing = !!announcement;
  const [state, action] = useActionState(
    editing ? updateAnnouncement : createAnnouncement,
    idleState
  );
  const [body, setBody] = useState(announcement?.body_md ?? "");
  const [preview, setPreview] = useState(false);

  if (state.ok) {
    return (
      <Card className="p-5">
        <Banner tone="success">{state.message}</Banner>
        {onClose && (
          <Button variant="ghost" className="mt-3" onClick={onClose}>
            Close
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        {state.error && <Banner tone="danger">{state.error}</Banner>}
        {editing && <input type="hidden" name="id" value={announcement.id} />}

        <div>
          <label className={labelCls}>Title</label>
          <Input
            name="title"
            required
            defaultValue={announcement?.title ?? ""}
            placeholder="e.g. Office closed on Friday"
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={labelCls}>Body (Markdown)</label>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="text-xs font-medium text-brand hover:underline"
            >
              {preview ? "Edit" : "Preview"}
            </button>
          </div>
          {preview ? (
            <Card className="max-h-72 overflow-auto p-4">
              <PolicyMarkdown content={body} />
            </Card>
          ) : (
            <Textarea
              name="bodyMd"
              rows={8}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What does everyone need to know?"
            />
          )}
          {/* Keep the value submitted while previewing. */}
          {preview && <input type="hidden" name="bodyMd" value={body} />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Expires (optional)</label>
            <Input
              type="datetime-local"
              name="expiresAt"
              defaultValue={toLocalInput(announcement?.expires_at ?? null)}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              After this, employees stop seeing it (history stays here).
            </p>
          </div>
          <div>
            <label className={labelCls}>Attachment (PDF/image, ≤5 MB)</label>
            <input
              type="file"
              name="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand"
            />
            {editing && announcement.attachment_path && (
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  name="removeAttachment"
                  className="h-3.5 w-3.5 accent-brand"
                />
                Remove current attachment
              </label>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            name="isPinned"
            defaultChecked={announcement?.is_pinned ?? false}
            className="h-4 w-4 accent-brand"
          />
          Pin to top
        </label>

        <div className="flex items-center gap-2">
          <SubmitButton editing={editing} />
          {onClose && (
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
          {!editing && (
            <span className="text-xs text-gray-400">
              Publishing notifies every active employee.
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
