import type { Lead } from "@prisma/client";

const HUBSPOT_BASE = "https://api.hubapi.com";

type HubSpotRecord = { id: string };

const CUSTOM_PROPERTIES = {
  contacts: { groupName: "contactinformation", names: ["linkedin_url", "hotel_name", "lead_category", "google_rating", "total_reviews_count", "sentiment_score"] },
  companies: { groupName: "companyinformation", names: ["hotel_name", "brand_type", "property_size_category", "google_rating", "total_reviews_count", "sentiment_score"] },
} as const;

function token(): string {
  return (process.env.HUBSPOT_ACCESS_TOKEN ?? "").trim();
}

async function hubspotRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = token();
  if (!accessToken) throw new Error("HUBSPOT_ACCESS_TOKEN is not configured");

  const response = await fetch(`${HUBSPOT_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`HubSpot ${response.status}: ${body.slice(0, 400)}`);
  }
  return (await response.json()) as T;
}

function contactProperties(lead: Lead): Record<string, string> {
  return {
    email: lead.email,
    firstname: lead.name.split(/\s+/)[0] || lead.name,
    lastname: lead.name.split(/\s+/).slice(1).join(" "),
    phone: lead.phone ?? "",
    jobtitle: lead.jobTitle ?? "",
    linkedin_url: lead.linkedinUrl ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    address: lead.exactAddress ?? lead.location ?? "",
    hotel_name: lead.hotelName ?? lead.company ?? "",
    lead_category: lead.subCategory ?? lead.category ?? "",
    google_rating: lead.googleRating == null ? "" : String(lead.googleRating),
    total_reviews_count: lead.totalReviewsCount == null ? "" : String(lead.totalReviewsCount),
    sentiment_score: lead.sentimentScore == null ? "" : String(lead.sentimentScore),
  };
}

function companyProperties(lead: Lead): Record<string, string> {
  return {
    name: lead.company ?? lead.hotelName ?? lead.name,
    domain: lead.website.replace(/^https?:\/\//, "").split("/")[0],
    phone: lead.phone ?? "",
    city: lead.city ?? "",
    state: lead.state ?? "",
    address: lead.exactAddress ?? lead.location ?? "",
    website: lead.website,
    hotel_name: lead.hotelName ?? lead.company ?? "",
    brand_type: lead.brandType ?? "",
    property_size_category: lead.propertySizeCategory ?? "",
    google_rating: lead.googleRating == null ? "" : String(lead.googleRating),
    total_reviews_count: lead.totalReviewsCount == null ? "" : String(lead.totalReviewsCount),
    sentiment_score: lead.sentimentScore == null ? "" : String(lead.sentimentScore),
  };
}

async function findByEmail(email: string): Promise<HubSpotRecord | null> {
  const result = await hubspotRequest<{ results: HubSpotRecord[] }>("/crm/v3/objects/contacts/search", {
    method: "POST",
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] }),
  });
  return result.results[0] ?? null;
}

async function findCompany(domain: string): Promise<HubSpotRecord | null> {
  if (!domain) return null;
  const result = await hubspotRequest<{ results: HubSpotRecord[] }>("/crm/v3/objects/companies/search", {
    method: "POST",
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "domain", operator: "EQ", value: domain }] }] }),
  });
  return result.results[0] ?? null;
}

async function upsertObject(type: "contacts" | "companies", existing: HubSpotRecord | null, properties: Record<string, string>) {
  if (existing) {
    return hubspotRequest<HubSpotRecord>(`/crm/v3/objects/${type}/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties }),
    });
  }
  return hubspotRequest<HubSpotRecord>(`/crm/v3/objects/${type}`, {
    method: "POST",
    body: JSON.stringify({ properties }),
  });
}

export function hubspotConfigured(): boolean {
  return Boolean(token());
}

export async function hubspotHealth(): Promise<void> {
  await hubspotRequest("/integrations/v1/me");
}

let customPropertiesReady: Promise<void> | null = null;

async function ensureCustomProperties() {
  if (customPropertiesReady) return customPropertiesReady;
  customPropertiesReady = (async () => {
    for (const [objectType, config] of Object.entries(CUSTOM_PROPERTIES)) {
      for (const name of config.names) {
      try {
        await hubspotRequest(`/crm/v3/properties/${objectType}`, {
          method: "POST",
          body: JSON.stringify({ name, label: name.replace(/_/g, " "), type: "string", fieldType: "text", groupName: config.groupName }),
        });
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("HubSpot 409"))) throw error;
      }
      }
    }
  })();
  return customPropertiesReady;
}

export async function syncLeadToHubSpot(lead: Lead) {
  await ensureCustomProperties();
  const contact = await upsertObject("contacts", await findByEmail(lead.email), contactProperties(lead));
  const domain = lead.website.replace(/^https?:\/\//, "").split("/")[0];
  const company = await upsertObject("companies", await findCompany(domain), companyProperties(lead));

  await hubspotRequest(`/crm/v4/objects/contacts/${contact.id}/associations/default/company/${company.id}`, {
    method: "PUT",
  });
  return { contactId: contact.id, companyId: company.id };
}