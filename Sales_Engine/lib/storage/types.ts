import type { Lead } from "@/lib/leadModel";

/** A place leads are kept: the whole table is read and written at once. */
export interface LeadStoreDriver {
  id: "excel" | "sheets" | "none";
  label: string;
  read(): Promise<Lead[]>;
  write(leads: Lead[]): Promise<void>;
  /**
   * Save only these leads' rows (stores people edit directly), leaving every
   * other row untouched. Used by transactions right after a fresh read().
   */
  writeRows?(leads: Lead[], changedIds: Set<number>): Promise<void>;
  /** Changes when the stored data may have changed (cache key). */
  version(): Promise<string>;
  /**
   * For stores people edit directly (Google Sheets): a hash of the stored
   * table right now, and the hash as of the last read(). Transactions read
   * fresh and check these before writing, so a save never overwrites an
   * edit made in the meantime.
   */
  fingerprint?(): Promise<string>;
  lastReadFingerprint?(): string | null;
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
