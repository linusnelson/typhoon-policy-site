"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { signVersion } from "@/actions/sign";
import { Button, Card, Input } from "@/components/ui";
import { SignaturePad } from "@/components/SignaturePad";
import type { PolicySignature, PolicyVersion } from "@/lib/types";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SignaturePanel({
  documentId,
  version,
  signature,
  defaultName,
}: {
  documentId: string;
  version: PolicyVersion;
  signature: PolicySignature | null;
  defaultName: string;
}) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState(defaultName);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (signature) {
    return (
      <Card className="border-success/30 bg-success-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-success">✓</span>
            <div>
              <p className="font-semibold text-[#14532D]">
                Signed — version {version.version_label}
              </p>
              <p className="mt-0.5 text-sm text-[#166534]">
                {signature.signer_name} · {formatDateTime(signature.signed_at)}
              </p>
            </div>
          </div>
          <a
            href={`/documents/${documentId}/signature/${signature.id}/pdf`}
            className="rounded-lg bg-offwhite px-3 py-2 text-sm font-semibold text-[#14532D] ring-1 ring-success/30 hover:bg-success-soft"
          >
            ↓ Download signed PDF
          </a>
        </div>
      </Card>
    );
  }

  function onSign() {
    setError(null);
    startTransition(async () => {
      const res = await signVersion(version.id, name, drawing);
      if (!res.ok) {
        setError(res.error ?? "Could not record your signature.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <h3 className="font-display text-base font-bold text-ink">
        Acknowledge &amp; sign
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Version {version.version_label}
        {version.effective_date
          ? ` · effective ${new Date(version.effective_date).toLocaleDateString(
              "en-IN",
              { dateStyle: "medium" }
            )}`
          : ""}
      </p>

      <label className="mt-4 flex items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#F8A71B]"
        />
        <span>
          I have read and understood this policy document, and I agree to comply
          with it.
        </span>
      </label>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Type your full name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your full name"
        />
      </div>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">
          Draw your signature
        </label>
        <SignaturePad onChange={setDrawing} />
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        onClick={onSign}
        disabled={!agreed || name.trim().length < 2 || !drawing || pending}
        className="mt-4"
      >
        {pending ? "Signing…" : "Sign & Acknowledge"}
      </Button>
      <p className="mt-3 text-xs text-gray-400">
        Your name, the time, and your device details are recorded as a
        tamper-evident acknowledgement.
      </p>
    </Card>
  );
}
