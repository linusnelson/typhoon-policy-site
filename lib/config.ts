// Shared service / role mailboxes that are NOT individual people. They are
// excluded from required-signer counts and never prompted to sign.
//
// Dual purpose: a service account may ALSO be a working login — e.g.
// admin@typhoonelec.com is provisioned as an admin employee (role='admin')
// and runs the admin panel. Being listed here only exempts it from policy
// signing/compliance; authorization stays entirely employees.role + RLS.
export const SERVICE_ACCOUNT_EMAILS = ["admin@typhoonelec.com"];

export function isServiceAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return SERVICE_ACCOUNT_EMAILS.includes(email.toLowerCase());
}
