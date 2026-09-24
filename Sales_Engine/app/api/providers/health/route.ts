import { NextResponse } from "next/server";
import { getFromBackend } from "@/lib/providerBackend";

export const runtime = "nodejs";

/**
 * Proxies the EXISTING provider backend health check (GET /api/crm/health) so
 * the Integrations page can display real provider configuration status.
 * No provider keys are exposed — the backend only reports configured true/false.
 */
export async function GET() {
  try {
    const res = await getFromBackend("/api/crm/health");
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      error?: { message?: string };
    } | null;
    if (!res.ok || !data?.success) {
      return NextResponse.json(
        { error: data?.error?.message ?? `Provider backend responded with ${res.status}.` },
        { status: 502 }
      );
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Provider backend is unreachable. Start the CRM backend (backendZip) and try again." },
      { status: 502 }
    );
  }
}