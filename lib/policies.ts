import { createClient } from "@/lib/supabase/server";
import type {
  DocumentWithStatus,
  Employee,
  PolicyDocument,
  PolicySignature,
  PolicyVersion,
} from "@/lib/types";

// Loads the signed-in employee row (matched by auth email via RLS).
// Returns null when there is no matching active employee.
export async function getCurrentEmployee(): Promise<Employee | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data } = await supabase
    .from("employees")
    .select("id, org_id, name, email, role, status")
    .eq("email", user.email)
    .maybeSingle();

  return (data as Employee | null) ?? null;
}

// All documents in the org, each joined with its current published version and
// the viewer's signature on that version (null if not yet signed).
export async function getDocumentsWithStatus(
  employee: Employee
): Promise<DocumentWithStatus[]> {
  const supabase = await createClient();

  const { data: documents } = await supabase
    .from("policy_documents")
    .select("*")
    .order("created_at", { ascending: true });

  if (!documents?.length) return [];

  const versionIds = documents
    .map((d) => (d as PolicyDocument).current_version_id)
    .filter((id): id is string => !!id);

  const [versionsRes, signaturesRes] = await Promise.all([
    versionIds.length
      ? supabase.from("policy_versions").select("*").in("id", versionIds)
      : Promise.resolve({ data: [] as PolicyVersion[] }),
    versionIds.length
      ? supabase
          .from("policy_signatures")
          .select("*")
          .eq("employee_id", employee.id)
          .in("version_id", versionIds)
      : Promise.resolve({ data: [] as PolicySignature[] }),
  ]);

  const versionById = new Map(
    ((versionsRes.data ?? []) as PolicyVersion[]).map((v) => [v.id, v])
  );
  const signatureByVersionId = new Map(
    ((signaturesRes.data ?? []) as PolicySignature[]).map((s) => [
      s.version_id,
      s,
    ])
  );

  return (documents as PolicyDocument[]).map((document) => {
    const currentVersion = document.current_version_id
      ? versionById.get(document.current_version_id) ?? null
      : null;
    const signature = currentVersion
      ? signatureByVersionId.get(currentVersion.id) ?? null
      : null;
    return { document, currentVersion, signature };
  });
}

export async function getDocument(
  id: string
): Promise<PolicyDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as PolicyDocument | null) ?? null;
}

export async function getVersion(id: string): Promise<PolicyVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_versions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as PolicyVersion | null) ?? null;
}

export async function getDocumentVersions(
  documentId: string
): Promise<PolicyVersion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_versions")
    .select("*")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false });
  return (data as PolicyVersion[]) ?? [];
}

// The viewer's signatures for a document, keyed by version_id.
export async function getMySignaturesForDocument(
  documentId: string,
  employeeId: string
): Promise<Map<string, PolicySignature>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("policy_signatures")
    .select("*")
    .eq("document_id", documentId)
    .eq("employee_id", employeeId);
  return new Map(
    ((data as PolicySignature[]) ?? []).map((s) => [s.version_id, s])
  );
}
