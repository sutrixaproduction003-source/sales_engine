/**
 * Apollo.io, server-side: reveal a lead's work email and mobile number, and
 * collect mobile numbers Apollo delivers later. Calls go through the provider
 * backend (backendZip), which holds the Apollo client.
 *
 * Credits: revealing a person costs 1 credit; a mobile number up to 8 more
 * (only when one is found). Searching and collecting results cost nothing.
 */

import { NextResponse } from "next/server";
import { getLead, updateLead } from "@/lib/leadDb";
import type { Lead, LeadUpdate } from "@/lib/leadModel";
import { callBackend, postToBackend } from "@/lib/providerBackend";

export type PhoneStatus = "pending" | "found" | "none";

export interface ApolloPerson {
  id?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string | null;
  email?: string;
  emailStatus?: string;
  phone?: string;
  linkedinUrl?: string;
  companyName?: string;
  companyWebsite?: string;
  location?: string;
  has_email?: boolean;
  has_phone?: boolean;
}

interface RevealResult {
  matched?: boolean;
  lead?: ApolloPerson | null;
  phoneRequestId?: string | null;
}

interface PhoneResult {
  status: "pending" | "found" | "none" | "failed";
  phone?: string;
  reason?: string;
}

/** Who to look up: the Apollo id when known, else name + company, else LinkedIn. */
export function revealInput(lead: Pick<Lead, "name" | "company" | "website" | "linkedinUrl" | "apolloId" | "email">) {
  const [firstName, ...rest] = lead.name.trim().split(/\s+/);
  const lastName = rest.join(" ");
  if (lead.apolloId) return { id: lead.apolloId };
  if (firstName && lastName && (lead.website || lead.company)) {
    return { firstName, lastName, companyWebsite: lead.website || undefined, organizationName: lead.company || undefined };
  }
  if (lead.linkedinUrl) return { linkedinUrl: lead.linkedinUrl };
  if (lead.email) return { email: lead.email };
  return null;
}

/** Reveal one person on Apollo. Returns a NextResponse on backend errors. */
export function revealPerson(input: Record<string, unknown>, { phone = false } = {}) {
  return callBackend<RevealResult>(() => postToBackend("/api/apollo/reveal", { ...input, revealPhone: phone }));
}

/** Lead fields from an Apollo match, never overwriting data the lead already has. */
export function leadPatch(lead: Partial<Lead>, result: RevealResult, { phone = false } = {}): LeadUpdate {
  const found = result.lead;
  if (!result.matched || !found) return phone ? { phoneStatus: lead.phone ? "found" : "none" } : {};

  const patch: LeadUpdate = {
    email: lead.email || found.email || null,
    linkedinUrl: lead.linkedinUrl || found.linkedinUrl || null,
    jobTitle: lead.jobTitle || found.jobTitle || null,
    website: lead.website || found.companyWebsite || "",
    company: lead.company || found.companyName || null,
    apolloId: found.id || lead.apolloId || null,
  };
  const knownPhone = lead.phone || found.phone || null;
  patch.phone = knownPhone;
  if (phone) {
    if (found.phone && !lead.phone) patch.phoneStatus = "found";
    else if (result.phoneRequestId) {
      patch.phoneStatus = "pending";
      patch.phoneRequestId = result.phoneRequestId;
    } else patch.phoneStatus = knownPhone ? "found" : "none";
  }
  return patch;
}

/**
 * Look up a stored lead's email (and optionally mobile) on Apollo and save
 * what was found. → { found, email, phoneStatus } or a NextResponse error.
 */
export async function revealLead(id: number, { phone = false } = {}) {
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const input = revealInput(lead);
  if (!input) {
    return NextResponse.json(
      { error: "Needs the person's full name and company (or a LinkedIn URL) to look them up on Apollo." },
      { status: 422 }
    );
  }

  const result = await revealPerson(input, { phone });
  if (result instanceof NextResponse) return result;

  const patch = leadPatch(lead, result, { phone });
  const updated = Object.keys(patch).length ? await updateLead(id, patch) : lead;
  return {
    found: Boolean(result.matched && result.lead),
    email: updated?.email ?? null,
    phone: updated?.phone ?? null,
    phoneStatus: (updated?.phoneStatus as PhoneStatus | null) ?? null,
  };
}

/** Senior people, when nobody at the business has one of the project's roles. */
const SENIOR = ["owner", "founder", "c_suite", "partner", "vp", "head", "director"];

/** Apollo people at a business's website domain (free search). */
async function peopleAtDomain(domain: string, body: Record<string, unknown>) {
  const res = await callBackend<{ people: ApolloPerson[] }>(() =>
    postToBackend("/api/apollo/search", { domain, perPage: 10, ...body })
  );
  return res instanceof NextResponse ? res : res.people;
}

export interface BusinessContact {
  found: boolean;
  /** Why nobody was found: "no_website" | "no_people". */
  reason?: string;
  name?: string;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  phoneStatus?: PhoneStatus | null;
}

/**
 * Fallback for scraped businesses without contact details: find the best
 * decision-maker at the business on Apollo (one of the project's roles,
 * else the most senior person), reveal their work email (1 credit) and
 * optionally mobile (up to 8), and make the lead that person at the business.
 * The business's own phone is kept in companyPhone.
 */
export async function findBusinessContact(
  id: number,
  { phone = false, roles = [] as string[] } = {}
): Promise<BusinessContact | NextResponse> {
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  if (!lead.website) return { found: false, reason: "no_website" };

  let people = await peopleAtDomain(lead.website, { titles: roles });
  if (people instanceof NextResponse) return people;
  if (!people.length) {
    people = await peopleAtDomain(lead.website, { seniorities: SENIOR });
    if (people instanceof NextResponse) return people;
  }
  // Prefer someone Apollo has an email for (and a phone, when asked).
  const best =
    people.find((p) => p.has_email && (!phone || p.has_phone)) ?? people.find((p) => p.has_email) ?? people[0];
  if (!best?.id) return { found: false, reason: "no_people" };

  const result = await revealPerson({ id: best.id }, { phone });
  if (result instanceof NextResponse) return result;
  const person = result.lead;
  if (!result.matched || !person?.fullName) return { found: false, reason: "no_people" };

  const patch: LeadUpdate = {
    name: person.fullName,
    jobTitle: person.jobTitle || best.jobTitle || null,
    company: lead.company || lead.hotelName || lead.name,
    // The person's own address beats the business's general inbox.
    email: person.email || lead.email,
    linkedinUrl: person.linkedinUrl || lead.linkedinUrl,
    apolloId: person.id || best.id,
    companyPhone: lead.companyPhone || lead.phone,
  };
  if (person.phone) {
    patch.phone = person.phone;
    patch.phoneStatus = "found";
  } else if (phone && result.phoneRequestId) {
    patch.phoneStatus = "pending";
    patch.phoneRequestId = result.phoneRequestId;
  } else if (phone) {
    patch.phoneStatus = "none";
  }

  const updated = await updateLead(id, patch);
  return {
    found: true,
    name: updated?.name,
    jobTitle: updated?.jobTitle,
    email: updated?.email,
    phone: updated?.phone,
    phoneStatus: (updated?.phoneStatus as PhoneStatus | null) ?? null,
  };
}

/**
 * Collect pending mobile numbers for these leads and save them.
 * → { [leadId]: { phoneStatus, phone } } or a NextResponse error.
 */
export async function collectPhones(leads: Lead[]) {
  const pending = leads.filter((l) => l.phoneStatus === "pending" && l.phoneRequestId);
  const out: Record<number, { phoneStatus: PhoneStatus; phone: string | null }> = {};
  for (const lead of leads) out[lead.id] = { phoneStatus: (lead.phoneStatus as PhoneStatus) || "none", phone: lead.phone };
  if (!pending.length) return out;

  const response = await callBackend<{ results: Record<string, PhoneResult> }>(() =>
    postToBackend("/api/apollo/phones", { requestIds: pending.map((l) => l.phoneRequestId) })
  );
  if (response instanceof NextResponse) return response;

  for (const lead of pending) {
    const result = response.results[lead.phoneRequestId as string];
    if (!result || result.status === "pending") continue;
    const phone = result.status === "found" && result.phone ? result.phone : lead.phone;
    const phoneStatus: PhoneStatus = phone ? "found" : "none";
    await updateLead(lead.id, { phone, phoneStatus, phoneRequestId: null });
    out[lead.id] = { phoneStatus, phone };
  }
  return out;
}
