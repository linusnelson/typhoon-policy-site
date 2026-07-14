import { createClient } from "@/lib/supabase/server";
import type { Announcement } from "@/lib/types";

// Announcement reads. Employee RLS returns only ACTIVE org announcements
// (expiry is enforced by the select policy); admins also see expired history.

export interface MyAnnouncement extends Announcement {
  readAt: string | null; // viewer's read receipt
}

export async function listMyAnnouncements(
  employeeId: string
): Promise<MyAnnouncement[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: reads }] = await Promise.all([
    supabase
      .from("announcements")
      .select("*")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("announcement_reads")
      .select("announcement_id, read_at")
      .eq("employee_id", employeeId),
  ]);

  const readByAnnouncement = new Map<string, string>();
  for (const r of reads ?? []) {
    readByAnnouncement.set(r.announcement_id as string, r.read_at as string);
  }

  return (((rows as Announcement[] | null) ?? [])).map((a) => ({
    ...a,
    readAt: readByAnnouncement.get(a.id) ?? null,
  }));
}

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as Announcement | null) ?? null;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface AnnouncementListRow extends Announcement {
  readCount: number;
  totalEmployees: number; // active, non-author baseline for "X / Y read"
}

export async function listAllAnnouncements(): Promise<AnnouncementListRow[]> {
  const supabase = await createClient();
  const [{ data: rows }, { data: reads }, { count: employees }] =
    await Promise.all([
      supabase
        .from("announcements")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("announcement_reads").select("announcement_id"),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

  const counts = new Map<string, number>();
  for (const r of reads ?? []) {
    const id = r.announcement_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  return (((rows as Announcement[] | null) ?? [])).map((a) => ({
    ...a,
    readCount: counts.get(a.id) ?? 0,
    totalEmployees: employees ?? 0,
  }));
}

export interface AnnouncementReadRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  readAt: string | null; // null = hasn't read yet
}

// Who has / hasn't read — every active employee joined with their receipt.
export async function getAnnouncementReads(
  announcementId: string
): Promise<AnnouncementReadRow[]> {
  const supabase = await createClient();
  const [{ data: emps }, { data: reads }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, name, employee_code")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("announcement_reads")
      .select("employee_id, read_at")
      .eq("announcement_id", announcementId),
  ]);

  const readBy = new Map<string, string>();
  for (const r of reads ?? []) {
    readBy.set(r.employee_id as string, r.read_at as string);
  }

  return (emps ?? []).map((e) => ({
    employeeId: e.id as string,
    employeeName: (e.name as string) ?? "",
    employeeCode: (e.employee_code as string) ?? "",
    readAt: readBy.get(e.id as string) ?? null,
  }));
}
