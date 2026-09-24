/**
 * HubSpot CRM sync (private app token from Settings). Server-side only.
 *
 * Each lead becomes a contact associated with a company. Records are matched
 * by the HubSpot ids saved on the lead, then by email (contacts) or domain /
 * name (companies), so re-syncing updates instead of duplicating. Leads
 * without an email sync too (HubSpot only needs a name).
 *
 * Token scopes: crm.objects.contacts.write, crm.objects.companies.write
 * (+ .read). Optional: crm.schemas.contacts.write / crm.schemas.companies.write
 * for the extra Sales Engine fields; without them only standard fields sync.
 */

import { getSetting } from "@/lib/appSettings";
import type { Lead, LeadStatus } from "@/lib/leadModel";

const HUBSPOT_BASE = "https://api.hubapi.com";

type HubSpotRecord = { id: string };

class HubSpotError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HubSpotError";
  }
}

/** Extra fields created in HubSpot (when the token may create properties). */
const CUSTOM_PROPERTIES = {
  contacts: {
    groupName: "contactinformation",
    names: ["linkedin_url", "lead_source_detail", "google_rating", "total_reviews_count", "sales_engine_status"],
  },
  companies: { groupName: "companyinformation", names: ["google_rating", "total_reviews_count", "google_maps_link"] },
} as const;

/** Pipeline status → HubSpot's standard "Lead Status" (hs_lead_status). */
const LEAD_STATUS: Record<LeadStatus, string> = {
  PENDING: "NEW",
  SCRAPED: "NEW",
  PERSONALIZED: "OPEN",
  SYNCED: "ATTEMPTED_TO_CONTACT",
  REJECTED: "UNQUALIFIED",
};

const token = () => getSetting("HUBSPOT_ACCESS_TOKEN");

export function hubspotConfigured(): boolean {
  return Boolean(token());
}

export function hubspotAutoSync(): boolean {
  return hubspotConfigured() && getSetting("HUBSPOT_AUTO_SYNC") === "true";
}

async function hubspotRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = token();
  if (!accessToken) throw new HubSpotError("HubSpot is not connected: add a private app token in Settings.", 401);

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${HUBSPOT_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      cache: "no-store",
    });
    if (response.status === 429 && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      const hint = response.status === 401 ? " (check the private app token)" : response.status === 403 ? " (the token is missing a scope)" : "";
      throw new HubSpotError(`HubSpot ${response.status}: ${body.message ?? response.statusText}${hint}`, response.status);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  }
}

/** Check the token by reading one contact (works with the contacts scope). */
export async function hubspotHealth(): Promise<void> {
  await hubspotRequest("/crm/v3/objects/contacts?limit=1");
}

// ---------- custom properties (best effort) ----------

const customState = globalThis as unknown as { __hubspotCustom?: Promise<Set<string>>; __hubspotCustomToken?: string };

/**
 * Create the extra fields once per HubSpot token (i.e. per portal); returns
 * the ones available ("contacts.x"). Switching the token in Settings starts over.
 */
function ensureCustomProperties(): Promise<Set<string>> {
  if (customState.__hubspotCustomToken !== token()) {
    customState.__hubspotCustom = undefined;
    customState.__hubspotCustomToken = token();
  }
  customState.__hubspotCustom ??= (async () => {
    const available = new Set<string>();
    for (const [objectType, config] of Object.entries(CUSTOM_PROPERTIES)) {
      for (const name of config.names) {
        try {
          await hubspotRequest(`/crm/v3/properties/${objectType}`, {
            method: "POST",
            body: JSON.stringify({ name, label: name.replace(/_/g, " "), type: "string", fieldType: "text", groupName: config.groupName }),
          });
          available.add(`${objectType}.${name}`);
        } catch (error) {
          if (error instanceof HubSpotError && error.status === 409) available.add(`${objectType}.${name}`);
          else if (error instanceof HubSpotError && error.status === 403) return available; // no schema scope
          else throw error;
        }
      }
    }
    return available;
  })().catch((error) => {
    customState.__hubspotCustom = undefined;
    throw error;
  });
  return customState.__hubspotCustom;
}

const text = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function domainOf(website: string) {
  return website.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
}

function pick(type: "contacts" | "companies", available: Set<string>, props: Record<string, string>) {
  const custom: Record<string, string> = CUSTOM_PROPERTIES[type].names.reduce(
    (acc, name) => (available.has(`${type}.${name}`) && props[name] !== undefined ? { ...acc, [name]: props[name] } : acc),
    {}
  );
  const standard = Object.fromEntries(
    Object.entries(props).filter(([key]) => !(CUSTOM_PROPERTIES[type].names as readonly string[]).includes(key))
  );
  return { ...standard, ...custom };
}

function contactProperties(lead: Lead, available: Set<string>) {
  const [first, ...rest] = lead.name.trim().split(/\s+/);
  return pick("contacts", available, {
    ...(lead.email ? { email: lead.email } : {}),
    firstname: first ?? lead.name,
    lastname: rest.join(" "),
    jobtitle: text(lead.jobTitle),
    company: text(lead.company),
    phone: text(lead.phone),
    website: text(lead.website),
    city: text(lead.city),
    state: text(lead.state),
    address: text(lead.exactAddress ?? lead.location),
    hs_lead_status: LEAD_STATUS[lead.status],
    linkedin_url: text(lead.linkedinUrl),
    lead_source_detail: text(lead.source),
    google_rating: text(lead.googleRating),
    total_reviews_count: text(lead.totalReviewsCount),
    sales_engine_status: lead.status,
  });
}

function companyProperties(lead: Lead, available: Set<string>) {
  return pick("companies", available, {
    name: text(lead.company ?? lead.hotelName ?? lead.name),
    ...(lead.website ? { domain: domainOf(lead.website), website: lead.website } : {}),
    phone: text(lead.phone),
    city: text(lead.city),
    state: text(lead.state),
    address: text(lead.exactAddress ?? lead.location),
    google_rating: text(lead.googleRating),
    total_reviews_count: text(lead.totalReviewsCount),
    google_maps_link: text(lead.googleMapsLink),
  });
}

async function search(type: "contacts" | "companies", propertyName: string, value: string): Promise<HubSpotRecord | null> {
  if (!value) return null;
  const result = await hubspotRequest<{ results: HubSpotRecord[] }>(`/crm/v3/objects/${type}/search`, {
    method: "POST",
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }], limit: 1 }),
  });
  return result.results[0] ?? null;
}

/** Update the known record, or create one; recreate if the known one was deleted. */
async function upsert(
  type: "contacts" | "companies",
  knownId: string | null,
  find: () => Promise<HubSpotRecord | null>,
  properties: Record<string, string>,
  createOnly: Record<string, string> = {}
): Promise<HubSpotRecord> {
  const body = (props: Record<string, string>) =>
    JSON.stringify({ properties: Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined)) });

  const existing = knownId ? { id: knownId } : await find();
  if (existing) {
    try {
      return await hubspotRequest<HubSpotRecord>(`/crm/v3/objects/${type}/${existing.id}`, { method: "PATCH", body: body(properties) });
    } catch (error) {
      if (!(error instanceof HubSpotError && error.status === 404 && knownId)) throw error;
      const found = await find();
      if (found) return hubspotRequest<HubSpotRecord>(`/crm/v3/objects/${type}/${found.id}`, { method: "PATCH", body: body(properties) });
    }
  }
  return hubspotRequest<HubSpotRecord>(`/crm/v3/objects/${type}`, { method: "POST", body: body({ ...properties, ...createOnly }) });
}

/** Create or update the lead's contact + company in HubSpot and associate them. */
export async function syncLeadToHubSpot(lead: Lead): Promise<{ contactId: string; companyId: string | null }> {
  const available = await ensureCustomProperties();

  const contact = await upsert(
    "contacts",
    lead.hubspotContactId,
    () => search("contacts", "email", lead.email ?? ""),
    contactProperties(lead, available),
    { lifecyclestage: "lead" }
  );

  let companyId: string | null = null;
  if (lead.company || lead.website) {
    const company = await upsert(
      "companies",
      lead.hubspotCompanyId,
      async () =>
        (lead.website ? await search("companies", "domain", domainOf(lead.website)) : null) ??
        (await search("companies", "name", lead.company ?? "")),
      companyProperties(lead, available)
    );
    companyId = company.id;
    await hubspotRequest(`/crm/v4/objects/contacts/${contact.id}/associations/default/company/${company.id}`, { method: "PUT" });
  }

  return { contactId: contact.id, companyId };
}

/** Log a sent email on the contact's timeline. */
export async function logEmailInHubSpot(contactId: string, email: { subject: string; body: string; sentAt: Date }) {
  await hubspotRequest("/crm/v3/objects/emails", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        hs_timestamp: email.sentAt.toISOString(),
        hs_email_direction: "EMAIL",
        hs_email_status: "SENT",
        hs_email_subject: email.subject,
        hs_email_text: email.body,
      },
      // 198 = email → contact (HubSpot-defined association type).
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }] }],
    }),
  });
}
