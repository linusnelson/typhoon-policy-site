import type { Offer, VendorSettings } from "../types";

/**
 * One file per vendor. To add a new vendor (API-based or scraped), implement
 * this interface and register it in vendors/index.ts — nothing else changes.
 */
export interface VendorAdapter {
  /** Display name, also used as the cache key prefix. */
  name: string;
  /** Native currency of the offers this adapter returns. */
  currency: string;
  /** Whether the settings contain the credentials this adapter needs. */
  hasCredentials(settings: VendorSettings): boolean;
  /**
   * Exact-MPN search. Return [] when the part genuinely isn't carried;
   * throw on transport/auth errors so they surface as 'error', not 'not_found'.
   */
  search(mpn: string, settings: VendorSettings): Promise<Offer[]>;
}

export class VendorAuthError extends Error {}
