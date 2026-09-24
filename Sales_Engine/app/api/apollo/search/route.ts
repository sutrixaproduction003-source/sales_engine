import { NextResponse } from "next/server";
import type { ApolloPerson } from "@/lib/apollo";
import { getProject, getProjectRoles } from "@/lib/projects";
import { callBackend, postToBackend } from "@/lib/providerBackend";

export const runtime = "nodejs";

/**
 * POST /api/apollo/search — find decision-makers in Apollo's database by
 * location + project (the project's target roles unless titles are given).
 * Free: names are partly hidden until a person is saved (revealed).
 *
 * { project, location, titles?, keywords?, page? } → { people, total, page }
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    project?: string;
    location?: string;
    titles?: string[];
    keywords?: string;
    page?: number;
  };
  const location = body.location?.trim();
  if (!location) return NextResponse.json({ error: "Enter a location, e.g. \"Chennai, India\"." }, { status: 400 });

  const titles = (Array.isArray(body.titles) ? body.titles : []).map((t) => String(t).trim()).filter(Boolean);
  const result = await callBackend<{ people: ApolloPerson[]; total: number; page: number }>(() =>
    postToBackend("/api/apollo/search", {
      location,
      titles: titles.length ? titles : getProjectRoles(getProject(body.project)),
      keywords: body.keywords?.trim() || undefined,
      page: body.page || 1,
    })
  );
  if (result instanceof NextResponse) return result;
  return NextResponse.json({ people: result.people, total: result.total, page: result.page });
}
