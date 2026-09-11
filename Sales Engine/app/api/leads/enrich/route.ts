import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const maxDuration = 60;

const BACKEND_URL =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:5000";

interface EnrichRequest {
    project?: string;
    provider?: string;
    lead?: {
        id?: string;
        firstName?: string;
        lastName?: string;
        companyWebsite?: string;
        email?: string;
        linkedinUrl?: string;
        [key: string]: unknown;
    };

    // Also allow the lead fields directly in the request.
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    name?: string;
    companyWebsite?: string;
    email?: string;
    linkedinUrl?: string;
    [key: string]: unknown;
}

function cleanString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as EnrichRequest;

        const provider = cleanString(body.provider).toLowerCase();

        if (!provider) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Provider is required.",
                },
                { status: 400 }
            );
        }

        // Support both:
        // { lead: { ... } }
        // and
        // { id, firstName, lastName, ... }
        const lead = body.lead ?? {};

        const id = cleanString(lead.id || body.id);
        const firstName = cleanString(lead.firstName || body.firstName);
        const lastName = cleanString(lead.lastName || body.lastName);
        const fullName = cleanString(lead.fullName || body.fullName || lead.name || body.name);
        const companyWebsite = cleanString(
            lead.companyWebsite || lead.website || body.companyWebsite || body.website
        );
        const email = cleanString(lead.email || body.email);
        const linkedinUrl = cleanString(
            lead.linkedinUrl || body.linkedinUrl
        );

        const hasDirectIdentifier =
            Boolean(id) || Boolean(email) || Boolean(linkedinUrl);

        const hasNameAndCompany =
            Boolean(firstName) &&
            Boolean(lastName) &&
            Boolean(companyWebsite);

        if (!hasDirectIdentifier && !hasNameAndCompany) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "A lead identifier, email, LinkedIn URL, or first name + last name + company website is required.",
                },
                { status: 400 }
            );
        }

        const backendPayload = {
            provider,
            id: id || undefined,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            companyWebsite: companyWebsite || undefined,
            email: email || undefined,
            linkedinUrl: linkedinUrl || undefined,
        };

        const response = await fetch(`${BACKEND_URL}/api/leads/enrich`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(backendPayload),
            cache: "no-store",
        });

        let data: unknown;

        try {
            data = await response.json();
        } catch {
            data = {
                success: false,
                error: "Backend returned an invalid response.",
            };
        }

        if (!response.ok) {
            return NextResponse.json(
                {
                    success: false,
                    provider,
                    error:
                        typeof data === "object" &&
                            data !== null &&
                            "error" in data &&
                            typeof (data as { error?: unknown }).error === "string"
                            ? (data as { error: string }).error
                            : `Lead enrichment failed with HTTP ${response.status}.`,
                    ...(typeof data === "object" && data !== null ? data : {}),
                },
                { status: response.status }
            );
        }

        // Save successfully enriched lead to Prisma database so it appears in the Lead Hub
        try {
            const resultData = data as Record<string, unknown>;
            const safeResultData = resultData as { data?: { lead?: Record<string, unknown> }; lead?: Record<string, unknown> };
            const enrichedLeadData = safeResultData?.lead || safeResultData?.data?.lead || {};
            
            const finalEmail = cleanString(enrichedLeadData.email || email);
            const finalWebsite = cleanString(enrichedLeadData.companyWebsite || enrichedLeadData.domain || companyWebsite);
            
            if (finalEmail && finalWebsite) {
                const finalName = cleanString(
                    enrichedLeadData.fullName || 
                    enrichedLeadData.name ||
                    fullName ||
                    `${cleanString(enrichedLeadData.firstName || firstName)} ${cleanString(enrichedLeadData.lastName || lastName)}`.trim()
                );
                
                await prisma.lead.upsert({
                    where: {
                        email_website: { email: finalEmail, website: finalWebsite }
                    },
                    update: {
                        name: finalName || "Unknown",
                        company: cleanString(enrichedLeadData.companyName || lead.companyName || lead.company) || null,
                        hotelName: cleanString(lead.hotelName) || null,
                        brandType: cleanString(lead.brandType) || null,
                        propertySizeCategory: cleanString(lead.propertySizeCategory) || null,
                        jobTitle: cleanString(enrichedLeadData.jobTitle || lead.jobTitle) || null,
                        linkedinUrl: cleanString(enrichedLeadData.linkedinUrl || linkedinUrl) || null,
                        phone: cleanString(enrichedLeadData.phone || lead.phone) || null,
                        location: cleanString(lead.location) || null,
                        city: cleanString(lead.city) || null,
                        state: cleanString(lead.state) || null,
                        exactAddress: cleanString(lead.exactAddress) || null,
                        googleMapsLink: cleanString(lead.googleMapsLink) || null,
                        industry: cleanString(lead.industry) || null,
                        source: cleanString(lead.source || provider) || null,
                        googleBusinessLink: cleanString(lead.googleBusinessLink) || null,
                        tripAdvisorLink: cleanString(lead.tripAdvisorLink) || null,
                        bookingComLink: cleanString(lead.bookingComLink) || null,
                        makeMyTripLink: cleanString(lead.makeMyTripLink) || null,
                        instagramLink: cleanString(lead.instagramLink) || null,
                        facebookLink: cleanString(lead.facebookLink) || null,
                        googleRating: typeof lead.googleRating === "number" ? lead.googleRating : undefined,
                        totalReviewsCount: typeof lead.totalReviewsCount === "number" ? lead.totalReviewsCount : undefined,
                        sentimentScore: typeof lead.sentimentScore === "number" ? lead.sentimentScore : undefined,
                        latitude: typeof lead.latitude === "number" ? lead.latitude : undefined,
                        longitude: typeof lead.longitude === "number" ? lead.longitude : undefined,
                    },
                    create: {
                        name: finalName || "Unknown",
                        email: finalEmail,
                        website: finalWebsite,
                        company: cleanString(enrichedLeadData.companyName || lead.companyName || lead.company) || null,
                        hotelName: cleanString(lead.hotelName) || null,
                        brandType: cleanString(lead.brandType) || null,
                        propertySizeCategory: cleanString(lead.propertySizeCategory) || null,
                        jobTitle: cleanString(enrichedLeadData.jobTitle || lead.jobTitle) || null,
                        phone: cleanString(enrichedLeadData.phone || lead.phone) || null,
                        linkedinUrl: cleanString(enrichedLeadData.linkedinUrl || linkedinUrl) || null,
                        location: cleanString(lead.location) || null,
                        city: cleanString(lead.city) || null,
                        state: cleanString(lead.state) || null,
                        exactAddress: cleanString(lead.exactAddress) || null,
                        googleMapsLink: cleanString(lead.googleMapsLink) || null,
                        industry: cleanString(lead.industry) || null,
                        project: cleanString(body.project) || null,
                        source: cleanString(lead.source || provider) || null,
                        googleBusinessLink: cleanString(lead.googleBusinessLink) || null,
                        tripAdvisorLink: cleanString(lead.tripAdvisorLink) || null,
                        bookingComLink: cleanString(lead.bookingComLink) || null,
                        makeMyTripLink: cleanString(lead.makeMyTripLink) || null,
                        instagramLink: cleanString(lead.instagramLink) || null,
                        facebookLink: cleanString(lead.facebookLink) || null,
                        googleRating: typeof lead.googleRating === "number" ? lead.googleRating : null,
                        totalReviewsCount: typeof lead.totalReviewsCount === "number" ? lead.totalReviewsCount : null,
                        sentimentScore: typeof lead.sentimentScore === "number" ? lead.sentimentScore : null,
                        latitude: typeof lead.latitude === "number" ? lead.latitude : null,
                        longitude: typeof lead.longitude === "number" ? lead.longitude : null,
                        status: "PENDING"
                    }
                });
            }
        } catch (dbErr) {
            console.error("Failed to save enriched lead to Prisma database:", dbErr);
        }

        return NextResponse.json(data, {
            status: 200,
        });
    } catch (error) {
        console.error("Lead enrichment route error:", error);

        return NextResponse.json(
            {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unable to enrich lead.",
            },
            { status: 500 }
        );
    }
}