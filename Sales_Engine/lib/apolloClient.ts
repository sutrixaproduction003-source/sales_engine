"use client";

/**
 * Apollo lookups from the browser: find work emails and mobile numbers for
 * leads, then wait for the mobile numbers Apollo delivers after a short delay.
 */

import { apiCall } from "@/lib/api";

const POLL_MS = 10_000;
/** Apollo usually delivers mobiles within a minute or two; later ones are collected next time. */
const MAX_WAIT_MS = 3 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Problems that affect every lead: stop instead of repeating them. */
const FATAL = /not configured|API key|credits|insufficient|401|403|master/i;

export async function apolloConfigured(): Promise<boolean> {
  try {
    const health = await apiCall<{ providers?: { apollo?: { configured?: boolean } } }>("/api/providers/health");
    return Boolean(health.providers?.apollo?.configured);
  } catch {
    return false;
  }
}

export interface ContactLookupResult {
  emails: number;
  phones: number;
  /** Mobiles Apollo is still looking up when we stopped waiting. */
  pending: number;
  error?: string;
}

/** Wait for pending mobile numbers of these leads. */
export async function waitForPhones(
  ids: number[],
  onProgress?: (pending: number, found: number) => void
): Promise<{ phones: number; pending: number }> {
  const began = Date.now();
  let waiting = ids;
  let phones = 0;
  while (waiting.length && Date.now() - began < MAX_WAIT_MS) {
    onProgress?.(waiting.length, phones);
    await sleep(POLL_MS);
    const { results } = await apiCall<{ results: Record<number, { phoneStatus: string }> }>("/api/leads/phones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: waiting }),
    });
    phones += waiting.filter((id) => results[id]?.phoneStatus === "found").length;
    waiting = waiting.filter((id) => results[id]?.phoneStatus === "pending");
  }
  return { phones, pending: waiting.length };
}

export interface BusinessContactUpdate {
  name?: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneStatus?: string | null;
}

/**
 * Fallback for scraped businesses without contact details: find a
 * decision-maker at each business on Apollo (work email; mobile with `phone`).
 * `onContact` reports each business's contact as it is found.
 */
export async function findBusinessContacts(
  ids: number[],
  { phone, project }: { phone: boolean; project: string },
  onProgress: (text: string) => void,
  onContact: (id: number, contact: BusinessContactUpdate) => void
): Promise<ContactLookupResult & { contacts: number }> {
  let contacts = 0;
  let emails = 0;
  let phones = 0;
  let error: string | undefined;
  const pending: number[] = [];

  for (let i = 0; i < ids.length; i++) {
    onProgress(`Finding decision-makers on Apollo · ${i + 1}/${ids.length} · ${contacts} found`);
    try {
      const res = await apiCall<BusinessContactUpdate & { found: boolean }>(`/api/leads/${ids[i]}/find-contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, project }),
      });
      if (!res.found) continue;
      contacts++;
      if (res.email) emails++;
      if (res.phoneStatus === "found") phones++;
      if (res.phoneStatus === "pending") pending.push(ids[i]);
      onContact(ids[i], res);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (FATAL.test(error)) break;
    }
  }

  let stillPending = pending.length;
  if (pending.length) {
    const began = Date.now();
    let waiting = pending;
    while (waiting.length && Date.now() - began < MAX_WAIT_MS) {
      onProgress(`Waiting for Apollo to deliver mobile numbers · ${waiting.length} pending · ${phones} found`);
      await sleep(POLL_MS);
      const { results } = await apiCall<{ results: Record<number, { phoneStatus: string; phone: string | null }> }>(
        "/api/leads/phones",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: waiting }) }
      );
      for (const id of waiting) {
        const r = results[id];
        if (r && r.phoneStatus !== "pending") {
          if (r.phoneStatus === "found") phones++;
          onContact(id, { phone: r.phone, phoneStatus: r.phoneStatus });
        }
      }
      waiting = waiting.filter((id) => results[id]?.phoneStatus === "pending");
    }
    stillPending = waiting.length;
  }
  return { contacts, emails, phones, pending: stillPending, error };
}

/**
 * Look up leads on Apollo: work emails (1 credit each) and, with `phone`,
 * mobile numbers (up to 8 more credits each, only when found).
 */
export async function findContacts(
  ids: number[],
  { phone }: { phone: boolean },
  onProgress?: (text: string) => void
): Promise<ContactLookupResult> {
  let emails = 0;
  let phones = 0;
  let error: string | undefined;
  const pending: number[] = [];

  for (let i = 0; i < ids.length; i++) {
    onProgress?.(`Looking up on Apollo · ${i + 1}/${ids.length} · ${emails} emails${phone ? ` · ${phones} mobiles` : ""}`);
    try {
      const res = await apiCall<{ email?: string | null; found?: boolean; phoneStatus?: string | null; already?: boolean }>(
        `/api/leads/${ids[i]}/${phone ? "find-phone" : "find-email"}`,
        { method: "POST" }
      );
      if (res.email && !res.already) emails++;
      if (res.phoneStatus === "found") phones++;
      if (res.phoneStatus === "pending") pending.push(ids[i]);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (FATAL.test(error)) break;
    }
  }

  let stillPending = pending.length;
  if (pending.length) {
    const waited = await waitForPhones(pending, (left, found) =>
      onProgress?.(`Waiting for Apollo to deliver mobile numbers · ${left} pending · ${phones + found} found`)
    );
    phones += waited.phones;
    stillPending = waited.pending;
  }
  return { emails, phones, pending: stillPending, error };
}
