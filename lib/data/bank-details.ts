import { createClient } from "@/lib/supabase/server";

// Employee bank details (bank name / account no / PAN) for payslip headers.
// Entered once by the employee on /profile; the row is born locked and
// re-editing needs an admin unlock (RLS-enforced — clock_bays migration
// 20260712000000). Reads: self, admin, or accounts approver.

export interface EmployeeBankDetails {
  id: string;
  employeeId: string;
  bankName: string;
  bankAccountNo: string;
  pan: string;
  locked: boolean;
  updatedAt: string;
}

function fromRow(row: Record<string, unknown>): EmployeeBankDetails {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    bankName: (row.bank_name as string) ?? "",
    bankAccountNo: (row.bank_account_no as string) ?? "",
    pan: (row.pan as string) ?? "",
    locked: (row.locked as boolean) ?? true,
    updatedAt: (row.updated_at as string) ?? "",
  };
}

const COLUMNS = "id, employee_id, bank_name, bank_account_no, pan, locked, updated_at";

export async function getMyBankDetails(
  employeeId: string
): Promise<EmployeeBankDetails | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employee_bank_details")
    .select(COLUMNS)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return data ? fromRow(data) : null;
}

// Admin employee page (admin SELECT clause).
export const getBankDetailsForEmployee = getMyBankDetails;

// Whole org, keyed by employee_id — the payslip manage page (presence flags)
// and importPayslips (header values). Approver SELECT clause makes this work
// for non-admin accounts users.
export async function listBankDetailsMap(): Promise<
  Map<string, EmployeeBankDetails>
> {
  const supabase = await createClient();
  const { data } = await supabase.from("employee_bank_details").select(COLUMNS);
  return new Map(
    ((data as Record<string, unknown>[] | null) ?? []).map((r) => {
      const d = fromRow(r);
      return [d.employeeId, d];
    })
  );
}
