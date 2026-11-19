/** Badge tones for the domain's states — the one place the colour meaning lives
 *  (BillForge plan v3 §3.2 item 4). Pure data; the Badge component does the rendering. */
export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const STAGE_TONES: Record<string, Tone> = {
  processing: "neutral",
  blocked: "danger",
  po_ready: "info",
  bill_ready: "brand",
};

export function stageTone(stage: string | null | undefined): Tone {
  return (stage && STAGE_TONES[stage]) || "neutral";
}

const SEVERITY_TONES: Record<string, Tone> = {
  FAIL: "danger",
  WARN: "warning",
  INFO: "neutral",
};

export function severityTone(severity: string | null | undefined): Tone {
  return (severity && SEVERITY_TONES[severity.toUpperCase()]) || "neutral";
}

const JOB_STATUS_TONES: Record<string, Tone> = {
  ok: "success",
  done: "success",
  blocked: "danger",
  failed: "danger",
  error: "danger",
  running: "info",
  queued: "neutral",
  pending: "neutral",
};

export function jobStatusTone(status: string | null | undefined): Tone {
  return (status && JOB_STATUS_TONES[status.toLowerCase()]) || "neutral";
}

const DOCUMENT_STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  issued: "success",
  blocked: "danger",
  error: "danger",
  mirrored: "success",
};

export function documentStatusTone(status: string | null | undefined): Tone {
  return (status && DOCUMENT_STATUS_TONES[status.toLowerCase()]) || "neutral";
}
