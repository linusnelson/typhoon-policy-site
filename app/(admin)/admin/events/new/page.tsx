import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { istToday } from "@/lib/ist";
import { listDepartments } from "@/lib/data/refs";
import { listEmployeeOptions } from "@/lib/data/employees";
import { listEventTypes } from "@/lib/data/admin-events";
import { createEventType } from "@/actions/admin-events";
import { EventCreateForm } from "@/components/admin/EventCreateForm";
import { Card, Input, Button } from "@/components/ui";

export default async function NewEventPage() {
  const [eventTypes, departments, employees] = await Promise.all([
    listEventTypes(),
    listDepartments(),
    listEmployeeOptions(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          href="/admin/events"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Back to events
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          Create event
        </h1>
      </div>

      <EventCreateForm
        eventTypes={eventTypes}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        employees={employees.filter((e) => e.role !== "admin")}
        today={istToday()}
      />

      <Card className="p-4">
        <form action={createEventType} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              Add a custom event type
            </label>
            <Input name="name" placeholder="e.g. Hackathon" />
          </div>
          <Button variant="secondary" type="submit">
            <Plus className="h-4 w-4" /> Add type
          </Button>
        </form>
      </Card>
    </div>
  );
}
