import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { requireEmployee, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getScheduleHeader,
  listScheduleGroupClaims,
} from "@/lib/data/expenses";
import {
  ExpenseGroupPdf,
  type ExpenseGroupPdfImage,
  type ExpenseGroupPdfRow,
} from "@/lib/pdf/expense-group-pdf";
import { formatIstDate, formatIstDateTime } from "@/lib/ist";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/types";

export const runtime = "nodejs";

// "Travel Expenses" report for one visit-schedule group: cover + expense
// table, bill images packed 4-per-A4 (sharp: WebP→JPEG, EXIF-rotated,
// downscaled), then every uploaded PDF bill merged in as its own pages
// (pdf-lib). Access: the owning employee, an expense approver, or an admin —
// RLS backstops every read (claims, schedule, storage).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ scheduleId: string }> }
) {
  let viewer;
  try {
    viewer = await requireEmployee();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const { scheduleId } = await ctx.params;
  const header = await getScheduleHeader(scheduleId);
  if (!header) {
    return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  }
  const allowed =
    header.employeeId === viewer.id ||
    viewer.role === "admin" ||
    viewer.is_expense_approver;
  if (!allowed) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  // Submitted claims only — drafts and cancelled never leave the portal.
  const claims = await listScheduleGroupClaims(scheduleId, [
    "pending",
    "approved",
    "rejected",
    "reimbursed",
  ]);
  if (claims.length === 0) {
    return NextResponse.json(
      { error: "No submitted expenses in this group yet." },
      { status: 404 }
    );
  }

  const inr = (n: number) =>
    `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(n)}`;

  const rows: ExpenseGroupPdfRow[] = claims.map((c) => ({
    billDate: formatIstDate(c.bill_date),
    description:
      c.description ??
      (c.category === "own_vehicle"
        ? `${c.distance_km ?? "—"} km × Rs. ${c.rate_per_km ?? 0}/km`
        : "—"),
    category: EXPENSE_CATEGORY_LABELS[c.category] ?? c.category,
    status: c.status.charAt(0).toUpperCase() + c.status.slice(1),
    amount: inr(c.amount),
  }));
  const claimedTotal = claims.reduce((s, c) => s + c.amount, 0);
  const approvedTotal = claims
    .filter((c) => c.status === "approved" || c.status === "reimbursed")
    .reduce((s, c) => s + c.reimbursable_amount, 0);

  // ── Download + classify attachments (session storage client — RLS-scoped) ──
  const supabase = await createClient();
  const images: ExpenseGroupPdfImage[] = [];
  const pdfBuffers: Array<{ name: string; bytes: Uint8Array }> = [];
  const skippedFiles: string[] = [];

  for (const c of claims) {
    for (const a of c.attachments) {
      const caption = `${EXPENSE_CATEGORY_LABELS[c.category] ?? c.category} · ${formatIstDate(c.bill_date)} · ${a.file_name}`;
      try {
        const { data, error } = await supabase.storage
          .from("expense-bills")
          .download(a.file_path);
        if (error || !data) throw error ?? new Error("download failed");
        const bytes = Buffer.from(await data.arrayBuffer());

        if (a.mime_type.startsWith("image/")) {
          // react-pdf embeds only PNG/JPEG; bills are mostly WebP. Convert,
          // honour EXIF rotation, and downscale for a sane file size.
          const jpeg = await sharp(bytes)
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();
          images.push({
            caption,
            dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
          });
        } else if (a.mime_type === "application/pdf") {
          // Pre-validate now so a corrupt file is reported on the cover
          // instead of blowing up the merge below.
          await PDFDocument.load(bytes, { ignoreEncryption: true });
          pdfBuffers.push({ name: a.file_name, bytes });
        } else {
          skippedFiles.push(a.file_name);
        }
      } catch {
        skippedFiles.push(a.file_name);
      }
    }
  }

  const monthLabel = new Date(
    `${header.visitDate ?? claims[0].bill_date}T00:00:00Z`
  ).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .maybeSingle();

  const base = await renderToBuffer(
    ExpenseGroupPdf({
      companyName: (org?.name as string) ?? "Typhoon Electronic Solutions",
      title: `Travel Expenses — ${header.label} — ${monthLabel}`,
      employeeName: header.employeeName ?? "Unknown",
      employeeCode: header.employeeCode,
      visitLabel: header.label,
      clients: header.clients,
      visitDate: header.visitDate ? formatIstDate(header.visitDate) : "—",
      rows,
      claimedTotal: inr(claimedTotal),
      approvedTotal: inr(approvedTotal),
      images,
      pdfAttachmentNames: pdfBuffers.map((p) => p.name),
      skippedFiles,
      generatedAt: formatIstDateTime(new Date()),
    })
  );

  // ── Merge uploaded PDF bills after the rendered report ──
  let outBytes: Uint8Array = new Uint8Array(base);
  if (pdfBuffers.length > 0) {
    const merged = await PDFDocument.load(base);
    for (const { name, bytes } of pdfBuffers) {
      try {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        for (const page of pages) merged.addPage(page);
      } catch {
        // Validated above; a failure here would still not be fatal.
        skippedFiles.push(name);
      }
    }
    outBytes = await merged.save();
  }

  const fileDate = (header.visitDate ?? claims[0].bill_date).slice(0, 7);
  return new NextResponse(Buffer.from(outBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="travel-expenses-${fileDate}-${(header.employeeCode ?? "emp").toLowerCase()}.pdf"`,
    },
  });
}
