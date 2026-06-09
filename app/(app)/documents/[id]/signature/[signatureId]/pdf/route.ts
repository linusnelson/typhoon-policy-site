import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { PolicyPdf } from "@/lib/pdf/policy-pdf";

export const runtime = "nodejs";

// Streams the signed PDF for a given signature. Access is governed by RLS on
// policy_signatures: an employee can fetch their own; admins/managers any in
// the org. Returns 404 if the signature isn't visible to the caller.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; signatureId: string }> }
) {
  const { id: documentId, signatureId } = await params;
  const supabase = await createClient();

  const { data: sig } = await supabase
    .from("policy_signatures")
    .select("*")
    .eq("id", signatureId)
    .eq("document_id", documentId)
    .maybeSingle();
  if (!sig) return new NextResponse("Not found", { status: 404 });

  const [{ data: version }, { data: document }, { data: employee }, { data: org }] =
    await Promise.all([
      supabase
        .from("policy_versions")
        .select("version_label, effective_date, content_md")
        .eq("id", sig.version_id)
        .single(),
      supabase
        .from("policy_documents")
        .select("title, slug, org_id")
        .eq("id", documentId)
        .single(),
      supabase
        .from("employees")
        .select("employee_code")
        .eq("id", sig.employee_id)
        .maybeSingle(),
      supabase.from("organizations").select("name").maybeSingle(),
    ]);

  if (!version || !document) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    PolicyPdf({
      companyName: org?.name ?? "Typhoon Electronics",
      documentTitle: document.title,
      versionLabel: version.version_label,
      effectiveDate: version.effective_date,
      contentMd: version.content_md,
      signerName: sig.signer_name,
      employeeCode: employee?.employee_code ?? null,
      signedAt: sig.signed_at,
      contentHash: sig.content_hash,
      ipAddress: sig.ip_address,
      userAgent: sig.user_agent,
      signatureImage: sig.signature_image ?? null,
    })
  );

  const empCode = employee?.employee_code ?? "employee";
  const filename = `${document.slug}-v${version.version_label}-${empCode}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
