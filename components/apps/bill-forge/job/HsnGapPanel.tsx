"use client";

import { jobHref } from "@/lib/apps/bill-forge/routes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { HsnGap, JobPayload, api } from "@/lib/apps/bill-forge/api";
import { Banner, Button, Card, Input } from "@/components/ui";
import { DataTable, TBody, THead, Td, Th, Tr } from "@/components/ui/DataTable";

/** Fill blank or provisional HSN codes without waiting for the Bill of Entry. */
export function HsnGapPanel({ job, gaps }: { job: JobPayload; gaps: HsnGap[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (gaps.length === 0) return null;

  const entered = Object.fromEntries(
    Object.entries(values).filter(([, code]) => code.trim().length > 0),
  );
  const invalid = Object.values(entered).some((code) => !/^\d{1,8}$/.test(code.trim()));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { job_id } = await api.regenerate(
        job.job_id,
        Object.fromEntries(
          Object.entries(entered).map(([part, code]) => [part, code.trim()]),
        ),
      );
      router.push(jobHref(job_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not regenerate this batch");
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-display text-base font-bold text-ink">
          Fill HSN codes without waiting for the Bill of Entry
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          These items have a blank or supplier-provisional HSN. Entering codes here
          regenerates the files and produces an Items Update CSV for Zoho. Codes entered
          by hand are flagged for your CA, and the Bill of Entry replaces them when it
          arrives.
        </p>
        <p className="mt-1 text-sm text-gray-500">
          This reuses the stored extraction — no AI cost.
        </p>
      </div>

      <DataTable className="shadow-none">
        <THead>
          <tr>
            <Th>Part</Th>
            <Th>Description</Th>
            <Th>Current</Th>
            <Th>HSN</Th>
          </tr>
        </THead>
        <TBody>
          {gaps.map((gap) => (
            <Tr key={gap.part}>
              <Td className="font-mono">{gap.part}</Td>
              <Td className="text-gray-600">{gap.description || "—"}</Td>
              <Td className="text-xs text-gray-500">
                {gap.hsn ?? "blank"} · {gap.source}
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <Input
                    value={values[gap.part] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [gap.part]: e.target.value })
                    }
                    placeholder={gap.hsn ?? "8 digits"}
                    inputMode="numeric"
                    maxLength={8}
                    className="w-28 py-1.5 font-mono"
                  />
                  {gap.suggestion && (
                    <button
                      type="button"
                      onClick={() =>
                        setValues({ ...values, [gap.part]: gap.suggestion!.hsn })
                      }
                      className="text-xs font-medium text-brand hover:underline"
                      title={`Remembered from ${gap.suggestion.source}`}
                    >
                      use {gap.suggestion.hsn}
                    </button>
                  )}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </DataTable>

      {invalid && (
        <Banner tone="danger">
          An HSN is digits only, at most 8 — a 10-digit HTSUS truncates to 8.
        </Banner>
      )}
      {error && <Banner tone="danger">{error}</Banner>}

      <Button
        type="button"
        disabled={busy || invalid || Object.keys(entered).length === 0}
        onClick={submit}
      >
        {busy
          ? "Regenerating…"
          : `Regenerate with ${Object.keys(entered).length} code${
              Object.keys(entered).length === 1 ? "" : "s"
            }`}
      </Button>
    </Card>
  );
}
