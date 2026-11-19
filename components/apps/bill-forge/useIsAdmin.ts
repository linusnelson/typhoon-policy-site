"use client";

import { useEffect, useState } from "react";
import { fetchMeOnce } from "@/lib/apps/bill-forge/me";

/** Whether the signed-in person is an admin, from the shared /api/me answer. `null`
 *  while unknown, so a page can hide admin-only controls instead of offering an action
 *  the API will refuse with 403. */
export function useIsAdmin(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    fetchMeOnce()
      .then((me) => setIsAdmin(me.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);
  return isAdmin;
}
