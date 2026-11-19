/** Who is signed in, fetched once per page load and shared.
 *
 *  The pages that hide admin-only controls all need the same answer; one request
 *  keeps them consistent. */

import { Principal, api } from "@/lib/apps/bill-forge/api";

let mePromise: Promise<Principal> | null = null;

export function fetchMeOnce(): Promise<Principal> {
  if (!mePromise) {
    mePromise = api.me().catch((err) => {
      mePromise = null;
      throw err;
    });
  }
  return mePromise;
}

export function invalidateMe(): void {
  mePromise = null;
}
