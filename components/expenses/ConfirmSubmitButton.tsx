"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui";

// Submit button for the small server-action forms on the expenses list and
// detail (submit a visit's drafts, delete a draft). Confirms first, because
// both are one-way: submitted drafts enter the approver's queue, and a deleted
// draft takes its bill files with it.
export function ConfirmSubmitButton({
  label,
  pendingLabel,
  confirm,
  variant = "primary",
  className,
}: {
  label: string;
  pendingLabel: string;
  confirm: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}
