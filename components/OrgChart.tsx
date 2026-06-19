import { Crown, ShieldCheck, Users } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import type { OrgChart as OrgChartData, Person, TeamNode } from "@/lib/data/org-map";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Avatar({ person, size = "md" }: { person: Person; size?: "md" | "lg" }) {
  const isHttp = !!person.photoUrl && /^https?:\/\//.test(person.photoUrl);
  const dim = size === "lg" ? "h-12 w-12 text-base" : "h-9 w-9 text-xs";
  if (isHttp) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.photoUrl!} alt={person.name} className={`${dim} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <div className={`${dim} flex shrink-0 items-center justify-center rounded-full bg-brand-soft font-display font-bold text-brand`}>
      {initials(person.name)}
    </div>
  );
}

function PersonChip({ person, manager }: { person: Person; manager?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
      <Avatar person={person} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">{person.name}</span>
          {manager && <Badge tone="brand">Manager</Badge>}
        </div>
        {person.designation && (
          <div className="truncate text-xs text-gray-400">{person.designation}</div>
        )}
      </div>
    </div>
  );
}

function TeamCard({ team }: { team: TeamNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-display text-sm font-bold text-ink">{team.name}</span>
        <span className="text-xs text-gray-400">
          {team.members.length + (team.manager ? 1 : 0)}
        </span>
      </div>
      {team.manager && (
        <div className="mb-2">
          <PersonChip person={team.manager} manager />
        </div>
      )}
      {team.members.length > 0 ? (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {team.members.map((m) => (
            <PersonChip key={m.id} person={m} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-gray-400">No members yet.</p>
      )}
    </div>
  );
}

export function OrgChart({ chart }: { chart: OrgChartData }) {
  const empty =
    chart.leadership.length === 0 &&
    chart.departments.length === 0 &&
    chart.orphans.length === 0;

  if (empty) {
    return (
      <Card className="p-10 text-center text-sm text-gray-400">
        Nothing to show yet — add employees, departments and teams first.
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {chart.leadership.length > 0 && (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-brand" />
            <h2 className="font-display font-bold text-ink">Leadership</h2>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {chart.leadership.map((p) => (
              <PersonChip key={p.id} person={p} />
            ))}
          </div>
        </Card>
      )}

      {chart.departments.map((d) => {
        const headcount =
          d.directMembers.length +
          d.teams.reduce((n, t) => n + t.members.length + (t.manager ? 1 : 0), 0);
        return (
          <Card key={d.id} className="p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand" />
                <h2 className="font-display font-bold text-ink">{d.name}</h2>
              </div>
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Users className="h-3.5 w-3.5" /> {headcount}
              </span>
            </div>

            {d.teams.length > 0 && (
              <div className="grid gap-3 lg:grid-cols-2">
                {d.teams.map((t) => (
                  <TeamCard key={t.id} team={t} />
                ))}
              </div>
            )}

            {d.directMembers.length > 0 && (
              <div className={d.teams.length > 0 ? "mt-4" : ""}>
                {d.teams.length > 0 && (
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Not in a team
                  </div>
                )}
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {d.directMembers.map((m) => (
                    <PersonChip key={m.id} person={m} />
                  ))}
                </div>
              </div>
            )}

            {d.teams.length === 0 && d.directMembers.length === 0 && (
              <p className="text-sm text-gray-400">No members in this department.</p>
            )}
          </Card>
        );
      })}

      {chart.orphans.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-display font-bold text-ink">No department</h2>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {chart.orphans.map((p) => (
              <PersonChip key={p.id} person={p} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
