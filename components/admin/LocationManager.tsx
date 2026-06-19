"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil, MapPin } from "lucide-react";
import { Badge, Banner, Button, Card, Input } from "@/components/ui";
import { saveLocation, setLocationActive } from "@/actions/locations";
import { idleState } from "@/lib/action-utils";
import type { Location } from "@/lib/types";

const selectCls =
  "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-[3px] focus:ring-brand/30";

function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-brand" />
      {label}
    </label>
  );
}

export function LocationManager({ rows }: { rows: Location[] }) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("")} disabled={editing === ""}>
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </div>

      {editing === "" && (
        <Card className="p-4">
          <LocationForm onDone={() => setEditing(null)} />
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {rows.length === 0 && editing !== "" && (
          <Card className="p-8 text-center text-sm text-gray-400 sm:col-span-2">
            No locations yet.
          </Card>
        )}
        {rows.map((l) =>
          editing === l.id ? (
            <Card key={l.id} className="p-4 sm:col-span-2">
              <LocationForm location={l} onDone={() => setEditing(null)} />
            </Card>
          ) : (
            <Card key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold text-ink">{l.name}</span>
                    {!l.is_active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  {l.address && (
                    <div className="mt-0.5 truncate text-sm text-gray-500">{l.address}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={l.geofence_mode === "strict" ? "danger" : "warning"}>
                      {l.geofence_mode} · {l.geofence_radius_m ?? 0}m
                    </Badge>
                    {l.selfie_required && <Badge tone="info">Selfie</Badge>}
                    {l.allow_qr_checkin && <Badge tone="neutral">QR</Badge>}
                    {l.allow_gps_checkin && <Badge tone="neutral">GPS</Badge>}
                  </div>
                  {l.lat != null && l.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                    >
                      <MapPin className="h-3 w-3" /> View on map
                    </a>
                  )}
                </div>
                <button
                  onClick={() => setEditing(l.id)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-ink"
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
              <form action={setLocationActive} className="mt-3">
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="active" value={(!l.is_active).toString()} />
                <button type="submit" className="text-sm font-medium text-gray-500 hover:text-ink">
                  {l.is_active ? "Deactivate" : "Activate"}
                </button>
              </form>
            </Card>
          )
        )}
      </div>
    </div>
  );
}

function LocationForm({ location, onDone }: { location?: Location; onDone: () => void }) {
  const [state, action, pending] = useActionState(saveLocation, idleState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={action} className="space-y-4">
      {location && <input type="hidden" name="id" value={location.id} />}
      <Input name="name" defaultValue={location?.name ?? ""} placeholder="Location name" required />
      <Input name="address" defaultValue={location?.address ?? ""} placeholder="Address (optional)" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Latitude</span>
          <Input type="number" step="any" name="lat" defaultValue={location?.lat ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Longitude</span>
          <Input type="number" step="any" name="lng" defaultValue={location?.lng ?? ""} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Radius (m)</span>
          <Input type="number" name="geofence_radius_m" defaultValue={location?.geofence_radius_m ?? 100} min={0} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Geofence</span>
          <select name="geofence_mode" defaultValue={location?.geofence_mode ?? "strict"} className={selectCls}>
            <option value="strict">Strict (block)</option>
            <option value="flexible">Flexible (flag)</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-5">
        <Check name="selfie_required" label="Selfie required" defaultChecked={location?.selfie_required ?? true} />
        <Check name="allow_qr_checkin" label="Allow QR check-in" defaultChecked={location?.allow_qr_checkin ?? true} />
        <Check name="allow_gps_checkin" label="Allow GPS check-in" defaultChecked={location?.allow_gps_checkin ?? true} />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : location ? "Save location" : "Add location"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {state.error && <Banner tone="warning">{state.error}</Banner>}
    </form>
  );
}
