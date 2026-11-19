"use client";

import { useEffect, useState } from "react";
import { HsnGap, JobPayload, api } from "@/lib/apps/bill-forge/api";
import { AttachBoePanel } from "@/components/apps/bill-forge/job/AttachBoePanel";
import { HsnGapPanel } from "@/components/apps/bill-forge/job/HsnGapPanel";

/**
 * The two ways to fill a missing HSN, in order of preference: the Bill of Entry if it
 * has now arrived, hand-entered codes if it has not. One fetch feeds both.
 */
export function HsnPanels({ job }: { job: JobPayload }) {
  const [gaps, setGaps] = useState<HsnGap[] | null>(null);
  const [awaiting, setAwaiting] = useState<string[]>([]);

  useEffect(() => {
    api
      .hsnGaps(job.job_id)
      .then((result) => {
        setGaps(result.gaps);
        setAwaiting(result.invoices_without_boe);
      })
      .catch(() => setGaps([]));
  }, [job.job_id]);

  if (gaps === null) return null;
  return (
    <>
      {awaiting.length > 0 && <AttachBoePanel job={job} awaiting={awaiting} />}
      <HsnGapPanel job={job} gaps={gaps} />
    </>
  );
}
