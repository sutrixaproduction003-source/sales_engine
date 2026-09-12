import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const BACKEND_URL = process.env.LEAD_BACKEND_URL || "http://localhost:5000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/api/scrapers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Scraper request failed." },
      { status: 502 }
    );
  }
}
