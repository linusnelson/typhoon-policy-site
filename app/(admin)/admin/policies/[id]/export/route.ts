import { NextResponse, type NextRequest } from "next/server";
import { getDocument } from "@/lib/policies";
import { getComplianceForDocument } from "@/lib/admin";
import { getCurrentEmployee } from "@/lib/policies";

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const employee = await getCurrentEmployee();
  if (!employee || employee.role !== "admin") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { id } = await params;
  const document = await getDocument(id);
  if (!document) return new NextResponse("Not found", { status: 404 });

  const report = await getComplianceForDocument(document);
  const version = report.currentVersion?.version_label ?? "";

  const header = [
    "Employee Name",
    "Email",
    "Version",
    "Status",
    "Signer Name",
    "Signed At (IST)",
  ];
  const rows = report.signers.map((s) => [
    s.employee.name,
    s.employee.email,
    version,
    s.signedAt ? "Signed" : "Pending",
    s.signerName ?? "",
    s.signedAt
      ? new Date(s.signedAt).toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "",
  ]);

  const csv = [header, ...rows]
    .map((r) => r.map((c) => csvCell(String(c))).join(","))
    .join("\r\n");

  const slug = document.slug || "document";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${slug}-signatures.csv"`,
    },
  });
}
