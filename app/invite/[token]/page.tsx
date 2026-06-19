import { Brand } from "@/components/Brand";
import { Card } from "@/components/ui";
import { lookupInvite } from "@/lib/data/invite";
import { InviteRegisterForm } from "@/components/InviteRegisterForm";

export const metadata = { title: "Join — Typhoon" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await lookupInvite(token);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Create your ClockBays account" />
        </div>
        <Card className="p-6">
          {!invite ? (
            <div className="text-center">
              <h1 className="mb-2 font-display text-xl font-bold text-ink">
                Invite not valid
              </h1>
              <p className="text-sm text-gray-500">
                This invite link is invalid or has expired. Ask your admin for a
                fresh link.
              </p>
            </div>
          ) : (
            <>
              <h1 className="mb-1 font-display text-xl font-bold text-ink">
                Join your team
              </h1>
              <p className="mb-6 text-sm text-gray-500">
                Fill in your details to create your account.
              </p>
              <InviteRegisterForm token={token} orgId={invite.orgId} />
            </>
          )}
        </Card>
        <p className="mt-6 text-center text-xs text-gray-400">
          Typhoon Electronics Solutions · Internal use only
        </p>
      </div>
    </main>
  );
}
