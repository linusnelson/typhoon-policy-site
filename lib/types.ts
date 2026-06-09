export type EmployeeRole = "admin" | "manager" | "employee";
export type EmployeeStatus = "active" | "inactive";
export type PolicyVersionStatus = "draft" | "published" | "archived";

export interface Employee {
  id: string;
  org_id: string;
  name: string;
  email: string;
  role: EmployeeRole;
  status: EmployeeStatus;
}

export interface PolicyDocument {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  current_version_id: string | null;
  created_at: string;
}

export interface PolicyVersion {
  id: string;
  document_id: string;
  org_id: string;
  version_label: string;
  change_summary: string | null;
  content_md: string;
  content_hash: string;
  effective_date: string | null;
  requires_resign: boolean;
  status: PolicyVersionStatus;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
}

export interface PolicySignature {
  id: string;
  org_id: string;
  document_id: string;
  version_id: string;
  employee_id: string;
  signer_name: string;
  signature_method: string;
  content_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  signed_at: string;
}

// A document joined with its current published version + the viewer's signature.
export interface DocumentWithStatus {
  document: PolicyDocument;
  currentVersion: PolicyVersion | null;
  signature: PolicySignature | null; // viewer's signature on currentVersion
}
