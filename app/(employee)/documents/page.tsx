import Link from "next/link";
import { Download, FileText, Receipt, Wallet } from "lucide-react";
import { getCurrentEmployee, getDocumentsWithStatus } from "@/lib/policies";
import { getOrgModules } from "@/lib/data/org";
import { getMyAdvances } from "@/lib/data/advances";
import { getMyPayslips } from "@/lib/data/payslips";
import { Badge, Banner, Button, Card } from "@/components/ui";
import { TabNav } from "@/components/ui/Tabs";
import { AdvanceStatusBadge } from "@/components/employee/AdvanceStatusBadge";
import { formatINR, formatMonth } from "@/lib/format";
import { formatIstDate } from "@/lib/ist";
import type { DocumentWithStatus } from "@/lib/types";

// The employee documents hub: company policies to sign, payslips uploaded by
// HR, and loan/advance statements — one tab each (module-gated).
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const employee = (await getCurrentEmployee())!; // layout guarantees presence
  const modules = await getOrgModules(employee.org_id);
  const { tab = "policies" } = await searchParams;

  const tabs = [
    { key: "policies", label: "Policies" },
    ...(modules.payslips ? [{ key: "payslips", label: "Payslips" }] : []),
    ...(modules.advances ? [{ key: "loans", label: "Loans & Advances" }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : "policies";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">My Documents</h1>
        <p className="mt-1 text-sm text-gray-500">
          Policies to sign, payslips, and loan/advance statements.
        </p>
      </div>

      <TabNav tabs={tabs} />

      {active === "payslips" ? (
        <PayslipsTab employeeId={employee.id} />
      ) : active === "loans" ? (
        <LoansTab employeeId={employee.id} />
      ) : (
        <PoliciesTab employee={employee} />
      )}
    </div>
  );
}

// ── Policies ─────────────────────────────────────────────────────────────────

async function PoliciesTab({
  employee,
}: {
  employee: NonNullable<Awaited<ReturnType<typeof getCurrentEmployee>>>;
}) {
  const all = await getDocumentsWithStatus(employee);
  // Employees only see PUBLISHED policies — unpublished drafts are not
  // signable (their content is RLS-hidden) and listing them made the
  // "all caught up" banner read as wrong. Admins manage drafts in
  // /admin/policies.
  const docs = all.filter((d) => d.currentVersion);
  const isService = employee.is_service_account;
  const pending = docs.filter((d) => !d.signature);

  return (
    <div className="space-y-4">
      {isService ? (
        <Banner tone="info">
          This is a service account — signing is not required. You can read all
          documents below.
        </Banner>
      ) : pending.length > 0 ? (
        <Banner tone="warning">
          You have {pending.length} document
          {pending.length > 1 ? "s" : ""} awaiting your signature.
        </Banner>
      ) : docs.length > 0 ? (
        <Banner tone="success">
          You&apos;re all caught up — every current policy is signed.
        </Banner>
      ) : null}

      <div className="space-y-3">
        {docs.length === 0 && (
          <Card className="p-8 text-center text-sm text-gray-500">
            No policy documents have been published yet.
          </Card>
        )}
        {docs.map((d) => (
          <DocumentRow key={d.document.id} item={d} isService={isService} />
        ))}
      </div>
    </div>
  );
}

function DocumentRow({
  item,
  isService,
}: {
  item: DocumentWithStatus;
  isService: boolean;
}) {
  const { document, currentVersion, signature } = item;
  return (
    <Link href={`/documents/${document.id}`} className="block">
      <Card className="p-5 transition-colors hover:border-gray-300">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-ink">
              {document.title}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {currentVersion
                ? `Version ${currentVersion.version_label}`
                : "No published version"}
              {currentVersion?.effective_date
                ? ` · effective ${new Date(
                    currentVersion.effective_date
                  ).toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                : ""}
            </p>
          </div>
          <div className="shrink-0">
            {!currentVersion ? (
              <Badge tone="neutral">Draft</Badge>
            ) : isService ? (
              <Badge tone="neutral">Published</Badge>
            ) : signature ? (
              <Badge tone="success">Signed</Badge>
            ) : (
              <Badge tone="warning">Signature required</Badge>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

// ── Payslips ─────────────────────────────────────────────────────────────────

async function PayslipsTab({ employeeId }: { employeeId: string }) {
  // No pre-signed storage URLs: downloads go through /payslips/[id]/download,
  // which re-authorises every request. See that route for why.
  const slips = await getMyPayslips(employeeId);

  if (slips.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">
        <Receipt className="mx-auto mb-2 h-6 w-6 text-gray-300" />
        No payslips yet — they&apos;ll appear here once HR uploads them.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {slips.map((s) => (
        <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <div className="font-display font-bold text-ink">
              {formatMonth(s.period_month)}
            </div>
            <div className="text-xs text-gray-400">
              Uploaded {formatIstDate(s.uploaded_at)}
            </div>
          </div>
          <a
            href={`/payslips/${s.id}/download`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="secondary" type="button">
              <Download className="h-4 w-4" /> Download
            </Button>
          </a>
        </Card>
      ))}
    </div>
  );
}

// ── Loans & Advances statements ──────────────────────────────────────────────

async function LoansTab({ employeeId }: { employeeId: string }) {
  const advances = await getMyAdvances(employeeId);
  // A statement exists once the request is approved.
  const withStatement = advances.filter((a) =>
    ["approved", "repaying", "closed"].includes(a.status)
  );

  if (withStatement.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">
        <Wallet className="mx-auto mb-2 h-6 w-6 text-gray-300" />
        No loan/advance statements yet — one is generated here as soon as a
        request is approved.
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {withStatement.map((a) => (
        <Card key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display font-bold text-ink">
                {formatINR(a.amount)}
              </span>
              <AdvanceStatusBadge status={a.status} />
            </div>
            <div className="text-xs text-gray-400">
              {a.installments} month{a.installments === 1 ? "" : "s"}
              {a.reviewed_at && <> · approved {formatIstDate(a.reviewed_at)}</>}
              {a.status === "repaying" && (
                <> · outstanding {formatINR(a.outstanding)}</>
              )}
            </div>
          </div>
          <a
            href={`/documents/loans/${a.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="secondary" type="button">
              <FileText className="h-4 w-4" /> Loan statement (PDF)
            </Button>
          </a>
        </Card>
      ))}
    </div>
  );
}
