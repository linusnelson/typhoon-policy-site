import type { VendorAdapter } from "./types";
import { digikey } from "./digikey";
import { mouser } from "./mouser";
import { element14 } from "./element14";

/**
 * Registry of active vendors, in display order.
 * To add a vendor: create a file implementing VendorAdapter and list it here.
 */
export const vendors: VendorAdapter[] = [digikey, mouser, element14];
