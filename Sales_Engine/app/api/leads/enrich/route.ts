import { NextRequest, NextResponse } from "next/server";
import { transaction } from "@/lib/leadDb";
import { postToBackend } from "@/lib/providerBackend";
import { NUMERIC_LEAD_FIELDS, cleanString, toLeadDetails, type ProviderLead } from "@/lib/leadRecord";

export const runtime = "nodejs";
export const maxDuration = 60;

type LeadInput = ProviderLead & {
    name?: string;
    website?: string;
    company?: string;
    [key: string]: unknown;
};

/** Accepts `{ provider, lead: {...} }` or the lead fields at the top level. */
interface EnrichRequest extends LeadInput {
    project?: string;
    provider?: string;
    lead?: LeadInput;
}

/**
 * Save an enriched lead so it appears in the Lead Hub. Enriched contact
 * fields win over what the client sent; everything else comes from the
 * client's copy of the lead.
 */
async function saveEnrichedLead(
    input: LeadInput,
    enriched: LeadInput,
    identity: { email: string; website: string; name: string },
    project: string,
    provider: string
) {
    const details = toLeadDetails({
        ...input,
        companyName: cleanString(enriched.companyName || input.companyName || input.company),
        jobTitle: cleanString(enriched.jobTitle || input.jobTitle),
        linkedinUrl: cleanString(enriched.linkedinUrl || input.linkedinUrl),
        phone: cleanString(enriched.phone || input.phone),
    });
    const source = cleanString(input.source || provider) || null;
    const name = identity.name || "Unknown";

    // On update, never overwrite stored numbers with "unknown".
    const update: Record<string, unknown> = { ...details, name, source };
    for (const field of NUMERIC_LEAD_FIELDS) {
        if (update[field] === null) delete update[field];
    }

    await transaction((tx) => {
        const existing = tx.find((l) => l.email === identity.email && l.website === identity.website);
        if (existing) {
            tx.update(existing.id, update);
        } else {
            tx.create({
                ...details,
                name,
                source,
                email: identity.email,
                website: identity.website,
                project: project || null,
                status: "PENDING",
            });
        }
    });
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as EnrichRequest;

        const provider = cleanString(body.provider).toLowerCase();
        if (!provider) {
            return NextResponse.json({ success: false, error: "Provider is required." }, { status: 400 });
        }

        const lead: LeadInput = body.lead ?? {};

        const id = cleanString(lead.id || body.id);
        const firstName = cleanString(lead.firstName || body.firstName);
        const lastName = cleanString(lead.lastName || body.lastName);
        const fullName = cleanString(lead.fullName || body.fullName || lead.name || body.name);
        const companyWebsite = cleanString(
            lead.companyWebsite || lead.website || body.companyWebsite || body.website
        );
        const email = cleanString(lead.email || body.email);
        const linkedinUrl = cleanString(lead.linkedinUrl || body.linkedinUrl);

        if (!id && !email && !linkedinUrl && !(firstName && lastName && companyWebsite)) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "A lead identifier, email, LinkedIn URL, or first name + last name + company website is required.",
                },
                { status: 400 }
            );
        }

        const response = await postToBackend("/api/leads/enrich", {
            provider,
            id: id || undefined,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            companyWebsite: companyWebsite || undefined,
            email: email || undefined,
            linkedinUrl: linkedinUrl || undefined,
        });

        const data = (await response.json().catch(() => ({
            success: false,
            error: "Backend returned an invalid response.",
        }))) as {
            error?: unknown;
            lead?: LeadInput;
            data?: { lead?: LeadInput };
        };

        if (!response.ok) {
            return NextResponse.json(
                {
                    success: false,
                    provider,
                    error:
                        typeof data?.error === "string"
                            ? data.error
                            : `Lead enrichment failed with HTTP ${response.status}.`,
                    ...(data && typeof data === "object" ? data : {}),
                },
                { status: response.status }
            );
        }

        const enriched: LeadInput = data?.lead || data?.data?.lead || {};
        const finalEmail = cleanString(enriched.email || email);
        const finalWebsite = cleanString(
            enriched.companyWebsite || (enriched as { domain?: string }).domain || companyWebsite
        );

        if (finalEmail && finalWebsite) {
            const finalName = cleanString(
                enriched.fullName ||
                    enriched.name ||
                    fullName ||
                    `${cleanString(enriched.firstName || firstName)} ${cleanString(enriched.lastName || lastName)}`.trim()
            );

            try {
                await saveEnrichedLead(
                    { ...lead, linkedinUrl },
                    enriched,
                    { email: finalEmail, website: finalWebsite, name: finalName },
                    cleanString(body.project),
                    provider
                );
            } catch (dbErr) {
                console.error("Failed to save enriched lead to the leads spreadsheet:", dbErr);
            }
        }

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error("Lead enrichment route error:", error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Unable to enrich lead." },
            { status: 500 }
        );
    }
}
