"use client";

import { useEffect, useRef } from "react";
import { markAnnouncementRead } from "@/actions/announcements";

// Records the read receipt as soon as the announcement detail page mounts —
// receipts without a "mark as read" button. Duplicate fires are no-ops
// (unique constraint + ignoreDuplicates upsert).
export function MarkReadOnView({ announcementId }: { announcementId: string }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const fd = new FormData();
    fd.set("id", announcementId);
    void markAnnouncementRead(fd);
  }, [announcementId]);
  return null;
}
