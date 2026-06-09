import { createClient } from "@/lib/supabase/server";
import type { Employee, PolicyDocument, PolicyVersion } from "@/lib/types";

export interface SignerRow {
  employee: Pick<Employee, "id" | "name" | "email">;
  signedAt: string | null;
  signerName: string | null;
}

export interface ComplianceReport {
  document: PolicyDocument;
  currentVersion: PolicyVersion | null;
  signers: SignerRow[];
  signedCount: number;
  pendingCount: number;
}

// Admin compliance for one document's current published version:
// every active employee in the org, with their signature status.
export async function getComplianceForDocument(
  document: PolicyDocument
): Promise<ComplianceReport> {
  const supabase = await createClient();

  let currentVersion: PolicyVersion | null = null;
  if (document.current_version_id) {
    const { data } = await supabase
      .from("policy_versions")
      .select("*")
      .eq("id", document.current_version_id)
      .maybeSingle();
    currentVersion = (data as PolicyVersion | null) ?? null;
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, name, email")
    .eq("status", "active")
    .order("name", { ascending: true });

  const activeEmployees = (employees as Pick<
    Employee,
    "id" | "name" | "email"
  >[]) ?? [];

  const signedByEmployee = new Map<
    string,
    { signedAt: string; signerName: string }
  >();

  if (currentVersion) {
    const { data: sigs } = await supabase
      .from("policy_signatures")
      .select("employee_id, signed_at, signer_name")
      .eq("version_id", currentVersion.id);
    for (const s of sigs ?? []) {
      signedByEmployee.set(s.employee_id as string, {
        signedAt: s.signed_at as string,
        signerName: s.signer_name as string,
      });
    }
  }

  const signers: SignerRow[] = activeEmployees.map((e) => {
    const sig = signedByEmployee.get(e.id);
    return {
      employee: e,
      signedAt: sig?.signedAt ?? null,
      signerName: sig?.signerName ?? null,
    };
  });

  const signedCount = signers.filter((s) => s.signedAt).length;
  return {
    document,
    currentVersion,
    signers,
    signedCount,
    pendingCount: signers.length - signedCount,
  };
}

export async function getAllDocuments(): Promise<PolicyDocument[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_documents")
    .select("*")
    .order("created_at", { ascending: true });
  return (data as PolicyDocument[]) ?? [];
}
