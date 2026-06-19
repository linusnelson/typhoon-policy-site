import { Smartphone, ShieldAlert } from "lucide-react";
import { getEmployeeDevices, getFlaggedPunches } from "@/lib/data/employee-detail";
import { formatIstDateTime } from "@/lib/ist";
import { Badge } from "@/components/ui";
import { MapLink } from "./MapLink";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display text-base font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export async function SecurityPanel({ employeeId }: { employeeId: string }) {
  const [devices, flagged] = await Promise.all([
    getEmployeeDevices(employeeId),
    getFlaggedPunches(employeeId),
  ]);

  return (
    <div className="space-y-8">
      <Section title="Registered devices">
        {devices.length === 0 ? (
          <p className="text-sm text-gray-400">No devices registered.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
            {devices.map((d) => (
              <li key={d.fingerprint} className="flex items-center gap-3 px-4 py-3">
                <Smartphone className="h-4 w-4 shrink-0 text-gray-400" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">
                    {d.name ?? "Unknown device"}
                  </div>
                  <div className="text-xs text-gray-500">
                    Registered {formatIstDateTime(d.registeredAt)} ·{" "}
                    <span className="font-mono">
                      {d.fingerprint.length > 12
                        ? `${d.fingerprint.slice(0, 12)}…`
                        : d.fingerprint}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Flagged punches"
        hint="Office punches recorded outside the geofence or admin-overridden. (Mock-GPS detection runs on-device and is not stored server-side.)"
      >
        {flagged.length === 0 ? (
          <p className="text-sm text-gray-400">No flagged punches.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-card border border-gray-200">
            {flagged.map((f, i) => (
              <li
                key={`${f.at}-${i}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-danger-deep" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      Punch {f.punchType} · {f.istTime}
                    </div>
                    <div className="flex gap-1.5 pt-0.5">
                      {f.outsideGeofence && (
                        <Badge tone="danger">Outside geofence</Badge>
                      )}
                      {f.overridden && <Badge tone="warning">Override</Badge>}
                    </div>
                  </div>
                </div>
                {f.lat != null && f.lng != null && (
                  <MapLink lat={f.lat} lng={f.lng} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
