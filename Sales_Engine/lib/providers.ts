/**
 * Website text collection through the Apify Website Content Crawler, with a
 * plain fetch fallback. Server-side only.
 */

import { getSetting } from "@/lib/appSettings";

const APIFY_BASE = "https://api.apify.com/v2";

function truncate(text: string, max: number): string {
  const clean = text.trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function stripHtml(html: string): string {
  const pairs: Array<Array<RegExp | string>> = [
    [/<script[\s\S]*?<\/script>/gi, " "],
    [/<style[\s\S]*?<\/style>/gi, " "],
    [/<[^>]+>/g, " "],
    [/&nbsp;/gi, " "],
    [/&amp;/gi, "&"],
    [/&lt;/gi, "<"],
    [/&gt;/gi, ">"],
    [/&quot;/gi, '"'],
    [/&#39;/gi, "'"],
    [/[\r\n\t]+/g, " "],
    [/\s{2,}/g, " "],
  ];
  let out = html;
  for (const p of pairs) {
    out = out.replace(p[0] as RegExp, p[1] as string);
  }
  return out.trim();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ==APIFY=============================================

type ApifyRun = {
  id: string;
  status: string;
  defaultDatasetId?: string;
};

export async function apifyScrape(website: string): Promise<string> {
  const token = getSetting("APIFY_TOKEN");
  const url = normalizeUrl(website);
  if (!token || !url) throw new Error("APIFY_TOKEN missing or invalid website URL");

  try {
    const startRes = await fetch(
      `${APIFY_BASE}/acts/apify~website-content-crawler/runs?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrls: [{ url }],
          maxCrawlDepth: 0,
          maxPagesPerCrawl: 1,
          maxResults: 1,
          maxConcurrency: 4,
          proxyConfiguration: { useApifyProxy: false },
        }),
      }
    );
    const runData = (await startRes.json()) as ApifyRun;
    if (!startRes.ok || !runData.id) throw new Error(`Apify start failed: ${startRes.status}`);

    const startedAt = Date.now();
    let status = runData.status;
    let datasetId = runData.defaultDatasetId;

    while ((status === "READY" || status === "RUNNING") && Date.now() - startedAt < 75000) {
      const res = await fetch(`${APIFY_BASE}/actor-runs/${runData.id}?token=${encodeURIComponent(token)}`);
      const body = (await res.json()) as ApifyRun;

      status = body.status ?? status;
      datasetId = datasetId ?? body.defaultDatasetId;

      if (status === "SUCCEEDED") break;
      await sleep(3000);
    }

    if (status !== "SUCCEEDED" || !datasetId) throw new Error(`Apify run ended: ${status}`);

    const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${encodeURIComponent(token)}&clean=true&format=json`);
    const items = (await itemsRes.json()) as Array<Record<string, unknown>>;

    const parts: string[] = [];
    for (const item of items.slice(0, 5)) {
      const text = String(item.text ?? "");
      const title = String(item.title ?? "");
      const pageUrl = String(item.url ?? "");
      if (title) parts.push(`Title: ${title}`);
      if (pageUrl) parts.push(`URL: ${pageUrl}`);
      if (text) parts.push(text);
    }
    if (parts.length === 0) throw new Error("Apify returned no text");
    return truncate(parts.join("\n\n"), 15000);
  } catch {
    const raw = await (await fetch(url, { headers: { "user-agent": "SalesEngine" } })).text();
    return truncate(stripHtml(raw), 15000);
  }
}
