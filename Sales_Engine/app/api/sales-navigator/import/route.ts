import { NextResponse } from "next/server";
import { transaction } from "@/lib/leadDb";
import { cleanString } from "@/lib/leadRecord";
import { getProject } from "@/lib/projects";
import { splitLocation, type SalesNavLead } from "@/lib/salesNavigatorImport";

export const runtime = "nodejs";

const SOURCE = "sales_navigator";
const MAX_LEADS = 500;

export interface ImportedLead {
  key: string;
  id: number;
  created: boolean;
}

/**
 * POST /api/sales-navigator/import — { project, leads: SalesNavLead[] }
 * Saves leads copied from a Sales Navigator list into the CRM. Importing the
 * same list again updates those leads instead of duplicating them.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { project?: string; leads?: SalesNavLead[] };
  const leads = (Array.isArray(body.leads) ? body.leads : []).filter((l) => cleanString(l?.name)).slice(0, MAX_LEADS);
  if (leads.length === 0) {
    return NextResponse.json({ error: "No leads to import." }, { status: 400 });
  }
  const project = getProject(body.project)?.id ?? null;

  try {
    const imported = await transaction((tx) =>
      leads.map((lead): ImportedLead => {
        const name = cleanString(lead.name);
        const company = cleanString(lead.company) || null;
        const location = cleanString(lead.location) || null;
        const { city, state } = splitLocation(location ?? "");
        const data = {
          name,
          jobTitle: cleanString(lead.jobTitle) || null,
          company,
          location,
          city,
          state,
          source: SOURCE,
        };

        // Same person = same name and company, and the same title and location
        // (two colleagues can share a name; merging them would overwrite one).
        const same = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
        const existing = tx.find(
          (l) =>
            l.source === SOURCE &&
            l.name === name &&
            l.company === company &&
            same(l.jobTitle, data.jobTitle) &&
            (!l.location || !location || same(l.location, location))
        );
        if (existing) {
          tx.update(existing.id, data);
          return { key: lead.key, id: existing.id, created: false };
        }
        const created = tx.create({ ...data, website: "", email: null, project, status: "PENDING" });
        return { key: lead.key, id: created.id, created: true };
      })
    );

    return NextResponse.json({
      imported,
      created: imported.filter((l) => l.created).length,
      updated: imported.filter((l) => !l.created).length,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import failed." }, { status: 500 });
  }
}
