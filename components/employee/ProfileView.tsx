import { Card } from "@/components/ui";
import { formatIstDate } from "@/lib/ist";
import { getMyProfile } from "@/lib/data/employee-profile";
import { PhoneForm } from "@/components/employee/PhoneForm";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

export async function ProfileView({ employeeId }: { employeeId: string }) {
  const p = await getMyProfile(employeeId);
  if (!p) {
    return (
      <Card className="p-8 text-center text-sm text-gray-400">
        Profile not found.
      </Card>
    );
  }

  const isHttpPhoto = !!p.photoUrl && /^https?:\/\//.test(p.photoUrl);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Profile</h1>

      <Card className="flex items-center gap-4 p-6">
        {isHttpPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.photoUrl!}
            alt={p.name}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft font-display text-xl font-bold text-brand">
            {initials(p.name)}
          </div>
        )}
        <div>
          <div className="font-display text-lg font-bold text-ink">{p.name}</div>
          <div className="text-sm text-gray-500">
            {p.designation || "—"}
            {p.employeeCode ? ` · ${p.employeeCode}` : ""}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display font-bold text-ink">Contact</h2>
        <PhoneForm phone={p.phone} />
        <p className="mt-3 text-xs text-gray-400">
          Email and emergency contact are managed by HR.
        </p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display font-bold text-ink">Details</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Email" value={p.email} />
          <Field label="Department" value={p.department} />
          <Field label="Location" value={p.location} />
          <Field label="Shift" value={p.shift} />
          <Field
            label="Date of joining"
            value={p.dateOfJoining ? formatIstDate(p.dateOfJoining) : null}
          />
          <Field label="Address" value={p.address} />
          <Field label="Emergency contact" value={p.emergencyContactName} />
          <Field label="Emergency phone" value={p.emergencyContactPhone} />
        </dl>
      </Card>
    </div>
  );
}
