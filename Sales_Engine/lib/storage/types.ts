import type { Lead } from "@/lib/leadModel";

/** A place leads are kept: the whole table is read and written at once. */
export interface LeadStoreDriver {
  id: "excel" | "sheets";
  label: string;
  read(): Promise<Lead[]>;
  write(leads: Lead[]): Promise<void>;
  /** Changes when the stored data may have changed (cache key). */
  version(): Promise<string>;
}

/**
 * A storage problem the user can act on ("close the file", "share the
 * sheet with …"). `kind` lets callers react without matching messages.
 */
export class LeadStoreError extends Error {
  constructor(message: string, readonly kind: "busy" | "config" | "access" | "api" = "api") {
    super(message);
    this.name = "LeadStoreError";
  }
}
