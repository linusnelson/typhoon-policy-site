import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { requireAdminOrManager, AuthzError } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMuster } from "@/lib/data/muster";
import { getMyTeamMemberIds } from "@/lib/data/team";
import { listDepartments, listLocations } from "@/lib/data/refs";
import { MusterPdf } from "@/lib/pdf/muster-pdf";
import { formatIstDateTime, istToday } from "@/lib/ist";

export const runtime = "nodejs";

// A4-landscape monthly attendance muster PDF. Same filters as the on-screen
// grid. Managers are scoped to their own team (RLS does not restrict the
// employees table to a manager's team, so we do it explicitly).
export async function GET(req: NextRequest) {
  let me;
  try {
    me = await requireAdminOrManager();
  } catch (e) {
    if (e instanceof AuthzError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  const today = istToday();
  const year = Number(sp.get("year") ?? today.slice(0, 4));
  const month = Number(sp.get("month") ?? today.slice(5, 7));
  const dept = sp.get("dept") || null;
  const loc = sp.get("loc") || null;
  const teamScope = me.role === "manager" ? await getMyTeamMemberIds() : null;

  const [{ dates, rows, monthLabel }, org, departments, locations] = await Promise.all([
    getMuster(year, month, { departmentId: dept, locationId: loc, employeeIds: teamScope }),
    (await createClient()).from("organizations").select("name").maybeSingle(),
    listDepartments(),
    listLocations(),
  ]);

  const deptLabel = dept
    ? departments.find((d) => d.id === dept)?.name ?? "Department"
    : "All departments";
  const locLabel = loc
    ? locations.find((l) => l.id === loc)?.name ?? "Location"
    : "All locations";
  const scopeLabel =
    me.role === "manager" ? "My team" : `${deptLabel} · ${locLabel}`;

  const buffer = await renderToBuffer(
    MusterPdf({
      companyName: (org.data?.name as string) ?? "Typhoon Electronic Solutions",
      monthLabel,
      scopeLabel,
      generatedAt: formatIstDateTime(new Date()),
      dates,
      rows,
    })
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="muster-${year}-${String(month).padStart(2, "0")}.pdf"`,
    },
  });
}
