import { NextResponse } from "next/server";
import { postToBackend } from "@/lib/providerBackend";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await postToBackend("/api/scrapers", body);
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Scraper request failed." },
      { status: 502 }
    );
  }
}
