/** Thin browser client over the BillForge FastAPI backend (repo document-generation-tes).
 *
 *  Identity is the portal's own Supabase session. Every call carries the access token
 *  as `Authorization: Bearer`; no cookie crosses to the API, so this site and the API
 *  on its own host need nothing more than CORS (the API's ALLOWED_ORIGINS must list
 *  this site's origin).
 *    no session — go to /login?redirect=<here>
 *    401 / 403  — thrown as ApiError and shown by the page. The API checks the same
 *                 application_access grant the layout already checked, so either one
 *                 means the two disagree (wrong Supabase project, stale grant cache). */

import { createClient } from "@/lib/supabase/client";
import type { components } from "@/lib/apps/bill-forge/openapi";

/** A schema as FastAPI publishes it (`npm run bill-forge:types`, see openapi.json):
 *  the Pydantic request bodies, and the response models in api/schemas/responses.py.
 *  Every response type below is an alias onto one of these, so a key the API adds,
 *  drops or makes nullable reaches the compiler instead of surfacing at runtime. */
type Schema<K extends keyof components["schemas"]> = components["schemas"][K];

/** Compile-time assertion that two object types name exactly the same keys. */
type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;
type Expect<T extends true> = T;

const BASE = process.env.NEXT_PUBLIC_BILLFORGE_API_URL || "http://localhost:8000";

export type Severity = Schema<"Severity">;
export type RuleResult = Schema<"RuleResult">;
export type ErrorReport = Schema<"ErrorReport">;
/** One settled reader disagreement: `value` is the finding's `resolve.printed` or
 *  `resolve.model`, verbatim. */
export type ReaderAnswer = Schema<"ReaderAnswer">;

export type InvoiceSummary = Schema<"InvoiceSummary">;
/** One generated file. `order` is its place in the Zoho import order (null when the file
 *  is not imported); `bytes`/`sha256` come from the run's manifest. */
export type JobFile = Schema<"JobFile">;

/** `system`: applied by the pipeline; cannot be created, renamed, or removed by hand. */
export type Tag = Schema<"Tag">;
export type TagWithCount = Schema<"TagWithCount">;

export type UsageDocument = Schema<"UsageDocument">;
/** The token and cost totals are absent (not null) until the batch has a usage row. */
export type Usage = Schema<"Usage">;

export type HsnGap = Schema<"HsnGap">;

/** A batch as history, rename and the run page list it. `org` is the issuing org
 *  detected from the billed party; null until E01 has passed. */
export type JobPayload = Schema<"JobPayload">;
/** GET /api/jobs/{id}: the payload plus the reconciliation summary. */
export type JobDetail = Schema<"JobDetail">;

/** The issuing org as it rides on jobs, register rows and documents. Null while a
 *  batch has not yet passed E01 (the billed party is not a configured org). */
export type OrgRef = Schema<"OrgRef">;

/** A Zoho organisation — one of the entities a supplier may bill, and whose Zoho
 *  receives the Items / PO / Bill / Sales Invoice CSVs. */
export type Org = Schema<"Org">;

/** The five Zoho-side names an org may override. Null on the org = "use the
 *  business.yaml default"; `effective` always holds the resolved value. */
export type OrgOverrides = Pick<
  Org,
  | "tax_group_inter_state"
  | "tax_group_intra_state"
  | "account_sales"
  | "account_purchase"
  | "account_inventory"
>;

export type OrgEffective = Schema<"OrgEffective">;
type _EffectiveCoversTheOverrides = Expect<SameKeys<OrgEffective, OrgOverrides>>;

/** The org dialog's draft: every field present as the form edits it — identifiers as
 *  strings ("" for none), overrides as null to clear. Not a wire type. */
export interface OrgFields extends OrgOverrides {
  slug: string;
  display_name: string;
  legal_name: string;
  gstin: string;
  iec: string;
  pan: string;
  state_code: string;
  gst_treatment: string;
  default_branch: string;
  default_warehouse: string;
  sales_number_pattern: string;
  is_active: boolean;
}
// The draft holds exactly the org's own fields (not its id or the resolved names).
type _OrgDraftMatchesOrg = Expect<SameKeys<OrgFields, Omit<Org, "id" | "effective">>>;

/** The org dialog's draft; `pan` is kept for display and validation even though the
 *  wire type below forbids it. */
export type OrgInput = OrgFields;
/** What POST/PATCH /api/orgs accept — the server's `OrgBody`. Every field is optional
 *  there (a PATCH sends only what changed); `pan` is derived from the GSTIN, not sent. */
export type OrgWrite = Schema<"OrgBody">;
// The draft minus the derived PAN must name exactly the fields the API takes, so a field
// added on one side without the other fails to compile here rather than 422 at runtime.
type _OrgDraftMatchesWire = Expect<SameKeys<Omit<OrgInput, "pan">, OrgWrite>>;

/** One Zoho tax applied to an HSN on the sales invoice, e.g. {name: GST5, type: Group, rate: 5}. */
export type HsnTax = Schema<"HsnTax">;

/** A directed seller → buyer pair. The two name strings belong to the pair, not to
 *  either org: they are what each org's accountant typed as the other's contact.
 *  `usd_multiplier` is a decimal string, so the server's precision survives. */
export type Relationship = Schema<"Relationship">;

/** The relationship dialog's draft: every field present, decimals as strings. */
export type RelationshipInput = Omit<Relationship, "id">;
/** What POST/PATCH /api/relationships accept — the server's `RelationshipBody`. */
export type RelationshipWrite = Schema<"RelationshipBody">;
type _RelationshipDraftMatchesWire = Expect<SameKeys<RelationshipInput, RelationshipWrite>>;

/** Why a purchase order cannot move on yet. `rule` names the validation rule that
 *  would block a real run, so the greyed-out row and the run report agree. */
export type Blocker = Schema<"Blocker">;

/** One register row. `latest_run_failed`: the newest attempt did not complete, whatever
 *  the PO reached before it. `org`: the entity the supplier billed. */
export type PurchaseOrder = Schema<"PurchaseOrder">;
export type PoStageEvent = Schema<"PoStageEvent">;
/** A batch as the purchase-order detail lists it. */
export type PoJob = Schema<"PoJob">;
export type PoDetail = Schema<"PoDetail">;

export interface PoFilters {
  stage?: string[];
  vendor?: string[];
  q?: string;
  has_boe?: boolean;
  hsn?: "blank" | "flagged" | "clean";
  invoiceable?: boolean;
  sort?: string;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

export type TraceDocument = Schema<"TraceDocument">;
/** One raw AI request/response. `present` is false when the manifest names a file the
 *  disk no longer has; `source` is "scan" for runs that predate the manifest. */
export type TraceLog = Schema<"TraceLog">;
export type Trace = Schema<"Trace">;

export type ActivityEntry = Schema<"ActivityEntry">;

export type DocumentFile = Schema<"DocumentFile">;
/** A sales invoice or mirror bill. `org` is the issuing org (the seller for an invoice,
 *  the buyer for its mirror). The list payload carries no report. */
export type DocumentPayload = Schema<"DocumentPayload">;
/** GET /api/documents/{id}: the payload plus the validation report it was generated under. */
export type DocumentDetail = Schema<"DocumentDetail">;

/** One group as POST /api/documents takes it: an RE number, a date, its POs, and the
 *  seller → buyer pair it is issued under. */
export type InvoiceGroup = Schema<"InvoiceGroup">;
/** One group as the "group into invoices" dialog builds it, before the pair is stamped on. */
export type InvoiceGroupInput = Omit<InvoiceGroup, "relationship_id">;
type CreateDocuments = Schema<"CreateDocuments">;

/** The API wants the seller → buyer pair on every group (one invoice may in principle
 *  go to a different buyer than the next); the dialog chooses one pair per session. */
function withRelationship(groups: InvoiceGroupInput[], relationshipId: string): InvoiceGroup[] {
  return groups.map((g) => ({ ...g, relationship_id: relationshipId }));
}

/** What a dry run says about one group before anything is written. */
export type GroupPreview = Schema<"GroupPreview">;

/** The dry-run answer: per-group previews plus the pair the invoices would be issued
 *  under, so the dialog can show "seller → buyer" from the server's own resolution. */
export type DocumentsPreview = Schema<"DocumentsPreview">;

export interface JobFilters {
  q?: string;
  tags?: string[];
  match?: "all" | "any";
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Who the API says we are: the backend's `Principal.as_dict`. */
export type Principal = Schema<"Principal">;

/** The current Supabase access token, or null when there is no session.
 *  supabase-js refreshes it in the background; getSession() hands back the live one. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** No session in this browser: sign in again and come back here. The portal's
 *  middleware does the same on the next navigation; this covers a tab left open. */
function goToLogin(): void {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  window.location.replace(`/login?redirect=${encodeURIComponent(here)}`);
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    goToLogin();
    throw new ApiError("Your session has ended. Sign in again.", 401);
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  // A 401 is never answered by signing out: that would end the person's whole portal
  // session over one application's backend refusing a token.
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/** FastAPI's `detail` is a string for HTTPException, an array of {loc, msg} for a 422,
 *  and an object ({message, report}) for the 409 on POST /api/documents. */
function detailToMessage(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      const loc = Array.isArray(d?.loc) ? d.loc.slice(1).join(".") : "";
      return loc ? `${loc}: ${d?.msg ?? "invalid"}` : String(d?.msg ?? "invalid");
    });
    return parts.join("; ") || fallback;
  }
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return fallback;
}

async function readError(response: Response): Promise<ApiError> {
  let detail = response.statusText;
  try {
    detail = detailToMessage((await response.json()).detail, detail);
  } catch {
    /* the body was not JSON; the status text will have to do */
  }
  return new ApiError(detail, response.status);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authedFetch(path, init);
  if (!response.ok) throw await readError(response);
  return response.json() as Promise<T>;
}

/** Fetch a file with the bearer token and hand it to the browser as a download.
 *  A plain `<a href>` cannot carry the Authorization header, so every file link in
 *  the UI goes through here. The file name comes from Content-Disposition when the
 *  API sets one, else from the caller. */
async function download(path: string, fallbackName: string): Promise<void> {
  const response = await authedFetch(path);
  if (!response.ok) throw await readError(response);
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the click a tick before revoking, else some browsers cancel the save.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  /** Who the backend resolved from the bearer token. */
  me: () => request<Principal>("/api/me"),

  createJob: (files: File[], name?: string) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    if (name?.trim()) form.append("name", name.trim());
    return request<Schema<"JobQueued">>("/api/jobs", { method: "POST", body: form });
  },

  job: (id: string) => request<JobDetail>(`/api/jobs/${id}`),
  report: (id: string) => request<ErrorReport>(`/api/jobs/${id}/report`),

  rename: (id: string, name: string | null) =>
    request<JobPayload>(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name } satisfies Schema<"JobPatch">),
    }),

  /** History search. `invoice_no` stays the exact-match duplicate lookup (FR8). */
  jobs: (filters: JobFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    (filters.tags ?? []).forEach((slug) => params.append("tag", slug));
    if (filters.match) params.set("match", filters.match);
    const query = params.toString();
    return request<Schema<"JobList">>(`/api/jobs${query ? `?${query}` : ""}`);
  },

  duplicatesOf: (invoiceNo: string) =>
    request<Schema<"JobList">>(
      `/api/jobs?invoice_no=${encodeURIComponent(invoiceNo)}`,
    ),

  tags: () => request<Schema<"TagCountList">>("/api/tags"),

  setTags: (id: string, tags: string[]) =>
    request<Schema<"TagList">>(`/api/jobs/${id}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags } satisfies Schema<"TagNames">),
    }),

  removeTag: (id: string, slug: string) =>
    request<Schema<"TagList">>(`/api/jobs/${id}/tags/${encodeURIComponent(slug)}`, {
      method: "DELETE",
    }),

  hsnGaps: (id: string) =>
    request<Schema<"HsnGaps">>(`/api/jobs/${id}/hsn-gaps`),

  /**
   * Attach a late-arriving Bill of Entry to a completed batch. The invoices are
   * replayed from that batch's storage, so only the BOE is sent to the model.
   */
  attachBoe: (
    id: string,
    files: File[],
    hsn?: Record<string, string>,
    name?: string,
  ) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    if (hsn && Object.keys(hsn).length > 0) form.append("hsn", JSON.stringify(hsn));
    if (name?.trim()) form.append("name", name.trim());
    return request<Schema<"JobQueuedWithCalls">>(`/api/jobs/${id}/attach-boe`, {
      method: "POST",
      body: form,
    });
  },

  regenerate: (id: string, hsn: Record<string, string>, name?: string) =>
    request<Schema<"JobQueuedWithCalls">>(`/api/jobs/${id}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hsn, name: name ?? null } satisfies Schema<"RegenerateRequest">),
    }),

  /** Settle a blocked batch's reader disagreements and re-run it from the stored
   *  extraction. Every blocking finding needs an answer; the server 409s otherwise. */
  resolve: (id: string, answers: ReaderAnswer[]) =>
    request<Schema<"JobQueuedWithCalls">>(`/api/jobs/${id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers } satisfies Schema<"ResolveRequest">),
    }),

  /** The purchase-order register — one row per supplier invoice, with its lifecycle. */
  pos: (filters: PoFilters = {}) => {
    const params = new URLSearchParams();
    (filters.stage ?? []).forEach((s) => params.append("stage", s));
    (filters.vendor ?? []).forEach((v) => params.append("vendor", v));
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    if (filters.has_boe !== undefined) params.set("has_boe", String(filters.has_boe));
    if (filters.hsn) params.set("hsn", filters.hsn);
    if (filters.invoiceable !== undefined)
      params.set("invoiceable", String(filters.invoiceable));
    if (filters.sort) params.set("sort", filters.sort);
    if (filters.desc !== undefined) params.set("desc", String(filters.desc));
    if (filters.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters.offset) params.set("offset", String(filters.offset));
    const query = params.toString();
    return request<Schema<"PoList">>(`/api/pos${query ? `?${query}` : ""}`);
  },

  po: (poNumber: string) =>
    request<PoDetail>(`/api/pos/${encodeURIComponent(poNumber)}`),

  /** Move one purchase order by hand. The note is required by the API, not just the UI. */
  setPoStage: (poNumber: string, stage: string, note: string) =>
    request<PurchaseOrder>(`/api/pos/${encodeURIComponent(poNumber)}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, note } satisfies Schema<"StageChange">),
    }),

  setPoStages: (poNumbers: string[], stage: string, note: string) =>
    request<Schema<"PoBulkResult">>("/api/pos/bulk/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ po_numbers: poNumbers, stage, note } satisfies Schema<"BulkStageChange">),
    }),

  markPoImported: (poNumber: string, which: "po" | "bill", imported: boolean) =>
    request<PurchaseOrder>(
      `/api/pos/${encodeURIComponent(poNumber)}/zoho-imported`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which, imported } satisfies Schema<"ImportMark">),
      },
    ),

  setPoNote: (poNumber: string, note: string | null) =>
    request<PurchaseOrder>(`/api/pos/${encodeURIComponent(poNumber)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note } satisfies Schema<"PoNote">),
    }),

  /** Everything needed to answer "why did this batch produce that". Works for any
   *  status — a failed run is the one you most need to read back. */
  trace: (id: string) => request<Trace>(`/api/jobs/${id}/trace`),

  /** One raw AI request or response, as text. Served only for names in the job's log
   *  index, so the PDFs and CSVs in the same folder stay unreachable. */
  traceLog: async (id: string, name: string): Promise<string> => {
    const response = await authedFetch(
      `/api/jobs/${id}/trace/${encodeURIComponent(name)}`,
    );
    if (!response.ok) throw await readError(response);
    return response.text();
  },

  activity: (filters: { user?: string; action?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.user) params.set("user", filters.user);
    if (filters.action) params.set("action", filters.action);
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    const query = params.toString();
    return request<Schema<"ActivityLog">>(`/api/activity${query ? `?${query}` : ""}`);
  },

  /** Validate a set of groups without writing anything — the dialog's live preview.
   *  `relationshipId` names the seller → buyer pair the invoices are issued under. */
  previewDocuments: (groups: InvoiceGroupInput[], relationshipId: string) =>
    request<DocumentsPreview>("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groups: withRelationship(groups, relationshipId),
        dry_run: true,
      } satisfies CreateDocuments),
    }),

  createDocuments: (groups: InvoiceGroupInput[], relationshipId: string) =>
    request<Schema<"CreatedDocuments">>("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groups: withRelationship(groups, relationshipId),
      } satisfies CreateDocuments),
    }),

  documents: (filters: { kind?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.kind) params.set("kind", filters.kind);
    if (filters.q?.trim()) params.set("q", filters.q.trim());
    const query = params.toString();
    return request<Schema<"DocumentList">>(`/api/documents${query ? `?${query}` : ""}`);
  },

  document: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),

  mirrorDocument: (id: string) =>
    request<DocumentPayload>(`/api/documents/${id}/mirror`, { method: "POST" }),

  downloadDocumentFile: (id: string, name: string) =>
    download(`/api/documents/${id}/files/${encodeURIComponent(name)}`, name),

  /** Zoho organisations. Any granted user may read; writes are admin-only (403 otherwise). */
  orgs: {
    list: () => request<Org[]>("/api/orgs"),
    create: (body: OrgWrite) =>
      request<Org>("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<OrgWrite>) =>
      request<Org>(`/api/orgs/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  },

  /** Seller → buyer pairs. Listed from the seller's side, which is how the
   *  "Sell to" picker and the admin page both need them. */
  relationships: {
    list: (sellerOrgId: string) =>
      request<Relationship[]>(
        `/api/relationships?seller_org_id=${encodeURIComponent(sellerOrgId)}`,
      ),
    create: (body: RelationshipWrite) =>
      request<Relationship>("/api/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    update: (id: string, body: Partial<RelationshipWrite>) =>
      request<Relationship>(`/api/relationships/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  },

  uploadItemMaster: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Schema<"ItemMasterUpload">>("/api/item-master", {
      method: "POST",
      body: form,
    });
  },

  /** Whole batch, or just the chosen files. No selection means the archive the run built. */
  downloadJobFiles: (id: string, files?: string[]) => {
    const params = new URLSearchParams();
    (files ?? []).forEach((name) => params.append("file", name));
    const query = params.toString();
    return download(
      `/api/jobs/${id}/download${query ? `?${query}` : ""}`,
      `${id.slice(0, 8)}.zip`,
    );
  },

  downloadJobFile: (id: string, name: string) =>
    download(`/api/jobs/${id}/files/${encodeURIComponent(name)}`, name),
};

/** What a batch is called, falling back to its short id while it has no name yet. */
export function jobTitle(job: Pick<JobPayload, "name" | "job_id">): string {
  return job.name ?? `Batch ${job.job_id.slice(0, 8)}`;
}

/** Stages a job moves through, in order, so the UI can show progress rather than a spinner. */
export const STAGES = [
  "queued",
  "classifying",
  "extracting",
  "validating",
  "enriching",
  "generating",
] as const;

export const TERMINAL = ["done", "blocked", "failed"];

/** Lifecycle stages, in order, with the wording the register shows.
 *
 *  `processing` and `blocked` both mean "nothing produced yet", which is why they sit
 *  together at the start rather than on the ladder proper. */
export const PO_STAGES: { id: string; label: string; hint: string }[] = [
  { id: "processing", label: "Processing", hint: "a batch is running against it" },
  { id: "blocked", label: "Blocked", hint: "the last run produced nothing" },
  { id: "po_ready", label: "PO", hint: "items and purchase-order CSVs generated" },
  { id: "bill_ready", label: "Bill", hint: "items and bill CSVs generated" },
];

export const PO_STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PO_STAGES.map((s) => [s.id, s.label]),
);

export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  sales_invoice: "Sales invoice",
  mirror_bill: "Mirror bill",
};

export const VENDOR_LABEL: Record<string, string> = {
  digikey: "Digi-Key",
  mouser: "Mouser",
  lcsc: "LCSC",
};
