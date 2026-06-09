// Shared service / role mailboxes that are NOT individual people. They are
// excluded from required-signer counts and never prompted to sign.
export const SERVICE_ACCOUNT_EMAILS = ["admin@typhoonelec.com"];

export function isServiceAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return SERVICE_ACCOUNT_EMAILS.includes(email.toLowerCase());
}
