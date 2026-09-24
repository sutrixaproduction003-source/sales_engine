import type { Lead } from "@prisma/client";

const APIFY_BASE = "https://api.apify.com/v2";
const INSTANTLY_BASE = "https://app.instantly.ai/api/v1";

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
  const token = (process.env.APIFY_TOKEN ?? "").trim();
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

// ==GROQ=============================================

export async function omniRoutePersonalize(scrapedContext: string): Promise<string> {
  const deepseekKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  const deepseekBase = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const deepseekModel = (process.env.DEEPSEEK_MODEL ?? "deepseek-chat").trim();
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  const baseUrl = (process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  const model = (process.env.GROQ_MODEL ?? "llama-3.1-8b-instant").trim();
  if (!deepseekKey && !apiKey) throw new Error("DEEPSEEK_API_KEY or GROQ_API_KEY missing");

  const system = [
    "You are a sales personalization expert.",
    "Write EXACTLY ONE natural, specific, and non-salesy icebreaker sentence.",
    "Ground it only in the scraped website text provided.",
    "Never invent facts that are not in the text.",
    'Respond ONLY with JSON: {"icebreaker":"..."}',
  ].join(" ");

  const prompt = [
    "Website text:",
    truncate(scrapedContext, 10000),
    "Write the one-sentence icebreaker now.",
  ].join("\n\n");

  const providers = [
    ...(deepseekKey ? [{ key: deepseekKey, base: deepseekBase, model: deepseekModel, reasoning: false }] : []),
    ...(apiKey ? [{ key: apiKey, base: baseUrl, model, reasoning: true }] : []),
  ];
  let lastError = "Groq returned no icebreaker";

  for (const provider of providers) {
    const models = provider.reasoning
      ? Array.from(new Set([provider.model, "llama-3.1-8b-instant"]))
      : [provider.model];
    for (const requestedModel of models) {
    const res = await fetch(provider.base + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + provider.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: requestedModel,
        temperature: 0.7,
        max_tokens: 300,
        ...(provider.reasoning ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok || data.error) {
      lastError = "Groq error: " + JSON.stringify(data);
      continue;
    }

    const choices = data.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const choiceContent = choices?.[0]?.message?.content;
    const content = Array.isArray(choiceContent)
      ? choiceContent
          .map((part) => (typeof part === "string" ? part : String((part as { text?: unknown }).text ?? "")))
          .join(" ")
      : typeof choiceContent === "string"
        ? choiceContent
        : typeof data.output_text === "string"
          ? data.output_text
          : "";
    const icebreaker = extractIcebreaker(content);
    if (icebreaker) return truncate(icebreaker, 600);
    }
  }

  const fallback = scrapedContext
    .replace(/\s+/g, " ")
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 30);
  if (fallback) return truncate(`I noticed this about your organization: ${fallback}.`, 600);
  throw new Error(lastError);
}

export function extractIcebreaker(content: string): string {
  let s = content.trim();
  if (s.startsWith("```")) {
    const lines = s.split("\n");
    lines.shift();
    s = lines.join("\n").replace(/```/g, "").trim();
  }
  try {
    const parsed = JSON.parse(s) as Record<string, unknown>;
    const v = parsed.icebreaker;
    if (typeof v === "string" && v.trim()) return v.trim();
    for (const k of Object.values(parsed)) {
      if (typeof k === "string" && k.trim()) return k.trim();
    }
  } catch {
    /* ignore */
  }
  const m = s.match(/"icebreaker"\s*:\s*"((?:\\.|[^"])*)"/);
  if (m) return m[1].replace(/\\"/g, '"').trim();
  return s.replace(/^[{}\s]+/g, "").replace(/[{}\s]+$/g, "").trim();
}

// ==INSTANT=============================================

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function instantlyPush(lead: Pick<Lead, "name" | "email" | "icebreaker">): Promise<void> {
  const apiKey = (process.env.INSTANTLY_API_KEY ?? "").trim();
  const baseUrl = (process.env.INSTANTLY_BASE_URL ?? INSTANTLY_BASE).replace(/\/$/, "");
  if (!apiKey) throw new Error("INSTANTLY_API_KEY missing");
  if (!lead.email) throw new Error("Lead has no email address");

  const parts = splitName(lead.name ?? "");

  const payload = {
    email: lead.email.trim(),
    name: lead.name.trim(),
    first_name: parts.first,
    last_name: parts.last,
    custom_variables: [{ key: "icebreaker", value: (lead.icebreaker ?? "").trim() }],
  };

const res = await fetch(baseUrl + "/leads", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error("Instantly error: " + res.status + " " + body.slice(0, 400));
  }
}