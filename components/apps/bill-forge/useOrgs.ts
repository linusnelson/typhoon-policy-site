"use client";

import { useCallback, useEffect, useState } from "react";
import { Org } from "@/lib/apps/bill-forge/api";
import { fetchOrgsOnce, invalidateOrgs, showOrgChips } from "@/lib/apps/bill-forge/orgs";

/** The shared org list plus the one question every list page asks of it: are there
 *  enough orgs for a chip to mean anything. `reload` drops the cache first, for the
 *  admin page after a write. */
export function useOrgs() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (fresh = false) => {
    if (fresh) invalidateOrgs();
    setLoading(true);
    try {
      setOrgs(await fetchOrgsOnce());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not load organisations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return {
    orgs,
    loading,
    error,
    showChips: showOrgChips(orgs),
    reload: () => load(true),
  };
}
