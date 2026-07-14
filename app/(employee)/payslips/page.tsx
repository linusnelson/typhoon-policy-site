import { redirect } from "next/navigation";

// Payslips moved into the Documents hub (Policies | Payslips | Loans &
// Advances). Old links keep working via this redirect.
export default function PayslipsPage() {
  redirect("/documents?tab=payslips");
}
