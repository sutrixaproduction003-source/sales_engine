/**
 * Sync leads to HubSpot and record the outcome on each lead. Server-side only.
 * Results are saved in one transaction (one write for the whole batch — this
 * matters for the Google Sheets store's write quota).
 */

import { listLeads, transaction } from "@/lib/leadDb";
import type { Lead } from "@/lib/leadModel";
import { hubspotAutoSync, logEmailInHubSpot, syncLeadToHubSpot } from "@/lib/hubspot";

/** A lead needs syncing if it never synced or changed since (with slack for the sync's own save). */
export function needsHubSpotSync(lead: Lead): boolean {
  if (!lead.hubspotSyncedAt) return true;
  return lead.updatedAt.getTime() - lead.hubspotSyncedAt.getTime() > 5000;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export async function syncLeads(leads: Lead[]): Promise<SyncResult> {
  const outcomes: { id: number; contactId?: string; companyId?: string | null; error?: string }[] = [];
  for (const lead of leads) {
    try {
      const ids = await syncLeadToHubSpot(lead);
      outcomes.push({ id: lead.id, ...ids });
    } catch (error) {
      outcomes.push({ id: lead.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const now = new Date();
  await transaction((tx) => {
    for (const outcome of outcomes) {
      tx.update(
        outcome.id,
        outcome.error
          ? { hubspotSyncStatus: "ERROR", hubspotSyncError: outcome.error.slice(0, 500) }
          : {
              hubspotContactId: outcome.contactId,
              hubspotCompanyId: outcome.companyId ?? null,
              hubspotSyncStatus: "SYNCED",
              hubspotSyncedAt: now,
              hubspotSyncError: null,
            }
      );
    }
  });

  const failed = outcomes.filter((o) => o.error);
  return {
    synced: outcomes.length - failed.length,
    failed: failed.length,
    errors: failed.map((o) => `#${o.id}: ${o.error}`).slice(0, 20),
  };
}

/**
 * When auto-sync is on, push these leads to HubSpot now. Never throws — a
 * CRM hiccup must not break saving leads or sending email.
 */
export async function autoSyncLeads(ids: number[]): Promise<void> {
  if (!hubspotAutoSync() || ids.length === 0) return;
  try {
    const wanted = new Set(ids);
    await syncLeads(await listLeads({ where: (lead) => wanted.has(lead.id) }));
  } catch (error) {
    console.error("HubSpot auto-sync failed:", error);
  }
}

/** After an approved email is sent: update the contact and log the email. */
export async function recordSentEmailInHubSpot(leadId: number, email: { subject: string; body: string; sentAt: Date }) {
  if (!hubspotAutoSync()) return;
  try {
    const [lead] = await listLeads({ where: (l) => l.id === leadId });
    if (!lead) return;
    await syncLeads([lead]);
    const [synced] = await listLeads({ where: (l) => l.id === leadId });
    if (synced?.hubspotContactId) await logEmailInHubSpot(synced.hubspotContactId, email);
  } catch (error) {
    console.error("HubSpot email logging failed:", error);
  }
}
