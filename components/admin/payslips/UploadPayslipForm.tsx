"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { idleState } from "@/lib/action-utils";
import { uploadPayslip } from "@/actions/payslips";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button variant="ghost" type="submit" disabled={pending}>
      <Upload className="h-4 w-4" />
      {pending ? "Uploading…" : "Upload"}
    </Button>
  );
}

// Inline per-row uploader for the admin month grid. PDF only, ≤ 5 MB
// (re-validated server-side in uploadPayslip).
export function UploadPayslipForm({
  employeeId,
  monthKey,
}: {
  employeeId: string;
  monthKey: string; // "YYYY-MM-01"
}) {
  const [state, action] = useActionState(uploadPayslip, idleState);

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="month" value={monthKey} />
      <input
        type="file"
        name="file"
        accept="application/pdf"
        required
        className="max-w-48 text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-gray-600 hover:file:bg-gray-200"
      />
      <SubmitButton />
      {state.error && (
        <span className="text-xs text-danger-deep">{state.error}</span>
      )}
    </form>
  );
}
