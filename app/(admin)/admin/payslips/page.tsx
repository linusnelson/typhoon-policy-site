import { redirect } from "next/navigation";

// Payslip management moved to /payslips/manage (outside /admin) so non-admin
// accounts users — is_expense_approver — can reach it. Kept as a redirect for
// old bookmarks.
export default function AdminPayslipsPage() {
  redirect("/payslips/manage");
}
