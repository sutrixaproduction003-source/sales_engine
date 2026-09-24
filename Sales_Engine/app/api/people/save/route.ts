import { NextResponse } from "next/server";
import { transaction } from "@/lib/leadDb";
import { cleanString, toLeadDetails } from "@/lib/leadRecord";
import { getProject } from "@/lib/projects";
import type { FoundPerson, SavePersonResult } from "@/lib/people";
import type { ScrapedPlace } from "@/lib/places";

export const runtime = "nodejs";

/**
 * POST /api/people/save — save a found person as a lead at their business.
 *
 * The person's own email is used when known; otherwise the business's
 * public inbox, so the draft can still be addressed to them by name.
 * Saving the same person again updates them instead of duplicating.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    person?: FoundPerson;
    business?: ScrapedPlace | null;
    project?: string;
  };
  const person = body.person;
  const business = body.business ?? null;
  const name = cleanString(person?.name);
  if (!person || !name) {
    return NextResponse.json({ error: "A person with a name is required." }, { status: 400 });
  }

  const personalEmail = cleanString(person.email);
  const businessEmail = cleanString(business?.email);
  const email = personalEmail || businessEmail || null;
  const emailKind: SavePersonResult["emailKind"] = personalEmail ? "personal" : businessEmail ? "business" : "none";
  const company = cleanString(business?.companyName) || cleanString(person.company) || null;
  const linkedinUrl = cleanString(person.linkedinUrl) || null;

  const data = {
    // Business location, links and rating; no place id (several people can
    // work at one place, and the place id is unique per lead).
    ...(business ? toLeadDetails({ ...business, companyName: company ?? undefined }) : {}),
    name,
    jobTitle: cleanString(person.jobTitle) || null,
    company,
    linkedinUrl,
    email,
    website: cleanString(business?.companyWebsite),
    project: getProject(body.project)?.id ?? null,
    source: person.source === "apollo" ? "apollo" : "linkedin_search",
  };

  try {
    const result = await transaction((tx) => {
      const existing = tx.find(
        (lead) =>
          (linkedinUrl && lead.linkedinUrl === linkedinUrl) ||
          (lead.name === name && lead.company === company && lead.source === data.source)
      );
      if (existing) {
        const lead = tx.update(existing.id, { ...data, project: existing.project ?? data.project, status: existing.status });
        return { lead: lead ?? existing, created: false };
      }
      return { lead: tx.create({ ...data, status: "PENDING" }), created: true };
    });

    return NextResponse.json({
      lead: { id: result.lead.id, status: result.lead.status, email: result.lead.email },
      created: result.created,
      emailKind,
    } satisfies SavePersonResult);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Saving failed." }, { status: 500 });
  }
}
