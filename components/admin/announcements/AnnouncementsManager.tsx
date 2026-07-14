"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, Pencil, Pin, PinOff, Plus, Trash2, Paperclip } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { AnnouncementForm } from "./AnnouncementForm";
import { toggleAnnouncementPin, deleteAnnouncement } from "@/actions/announcements";
import { formatIstDate } from "@/lib/ist";
import type { AnnouncementListRow } from "@/lib/data/announcements";

export function AnnouncementsManager({ rows }: { rows: AnnouncementListRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = rows.find((r) => r.id === editingId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!creating && !editing && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New announcement
          </Button>
        )}
      </div>

      {(creating || editing) && (
        <AnnouncementForm
          key={editingId ?? "new"}
          announcement={editing}
          onClose={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}

      {rows.length === 0 && !creating ? (
        <Card className="p-10 text-center text-sm text-gray-400">
          No announcements yet.
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const expired =
              a.expires_at !== null && new Date(a.expires_at) <= new Date();
            return (
              <Card key={a.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-display font-bold text-ink">
                        {a.title}
                      </span>
                      {a.is_pinned && <Badge tone="brand">Pinned</Badge>}
                      {expired ? (
                        <Badge tone="neutral">Expired</Badge>
                      ) : (
                        <Badge tone="success">Active</Badge>
                      )}
                      {a.attachment_path && (
                        <Paperclip className="h-3.5 w-3.5 text-gray-400" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatIstDate(a.created_at)}
                      {a.expires_at && <> · expires {formatIstDate(a.expires_at)}</>}
                      {" · "}
                      <span className="font-medium text-gray-500">
                        {a.readCount} / {a.totalEmployees} read
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Link href={`/admin/announcements/${a.id}`} title="Read receipts">
                      <Button variant="ghost" type="button">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <form action={toggleAnnouncementPin}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button
                        variant="ghost"
                        type="submit"
                        title={a.is_pinned ? "Unpin" : "Pin to top"}
                      >
                        {a.is_pinned ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                      </Button>
                    </form>
                    <Button
                      variant="ghost"
                      type="button"
                      title="Edit"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(a.id);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button variant="ghost" type="submit" title="Delete">
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
