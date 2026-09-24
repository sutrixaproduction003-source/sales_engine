/**
 * Parse text copied from a LinkedIn Sales Navigator lead list or lead search
 * (select the page with Ctrl+A, copy with Ctrl+C) into leads.
 *
 * The user copies what they can already see in their own seat; nothing here
 * talks to LinkedIn. Copied text is one field per line, e.g. for a lead list:
 *
 *   Nuthakki Vishnu Vardhan
 *   · 3rd
 *   2 Lists
 *   Plant Head - Padi plant
 *   Lucas TVS Ltd
 *   Chennai, Tamil Nadu, India
 *   Add note
 *   No activity
 *   9/24/2026
 */

export interface SalesNavLead {
  /** Stable key within one paste (name + account). */
  key: string;
  name: string;
  jobTitle: string;
  company: string;
  location: string;
  connection: string | null;
}

const DEGREE = /(?:^|\s)·?\s*(1st|2nd|3rd\+?|3rd)\s*$/i;
const DATE_LINE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

/** UI text that is never a lead field. */
const NOISE = [
  /^·$/,
  /^\d+\s+lists?$/i,
  /^add note$/i,
  /^no activity$/i,
  /^(viewed|saved|save|message|more|select|select all|remove|connect|follow)$/i,
  /^(name|account|geography|notes|outreach activity|date added|sort by:?.*)$/i,
  /^(add to another list|copy list|view in search|lead filters|account filters|saved searches|personas)$/i,
  /^(changed jobs|posted on linkedin|share experiences|total results).*$/i,
  /^\d+$/,
  /^(emailed|messaged|inmail sent|replied).*/i,
  /^(chat with us|sales navigator|home|accounts|leads|messaging|search)$/i,
  /^last updated .*/i,
  /^lead lists$/i,
];

const isNoise = (line: string) => NOISE.some((pattern) => pattern.test(line));

/** "Nuthakki Vishnu Vardh..." → "Nuthakki Vishnu Vardh" (truncated display). */
const stripEllipsis = (value: string) => value.replace(/\s*(\.\.\.|…)$/, "").trim();

function tidyName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.every((w) => /^[A-Z][a-z'’.-]*$/.test(w) || /^[A-Z]\.?$/.test(w))) return words.join(" ");
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function looksLikeLocation(line: string) {
  return /,/.test(line) && /\b(india|area|district|state|region|united|kingdom|emirates|singapore|usa|canada|australia)\b/i.test(line);
}

/**
 * Split the pasted text into one block of lines per lead. Lead lists end each
 * row with the "Date added" date; lead search results have no dates, so each
 * connection degree ("· 3rd") starts a new lead instead.
 */
function splitBlocks(lines: string[]): string[][] {
  const hasDates = lines.some((l) => DATE_LINE.test(l));
  const blocks: string[][] = [];
  let current: string[] = [];

  lines.forEach((line, i) => {
    if (hasDates) {
      if (DATE_LINE.test(line)) {
        if (current.length) blocks.push(current);
        current = [];
      } else {
        current.push(line);
      }
      return;
    }
    // No dates: a degree marker belongs to the name just before it.
    const next = lines[i + 1] ?? "";
    const startsLead = DEGREE.test(line) ? /^\S.*\S\s+·?\s*(1st|2nd|3rd)/i.test(line) : /^·?\s*(1st|2nd|3rd\+?)$/i.test(next);
    if (startsLead && current.length) {
      blocks.push(current);
      current = [];
    }
    current.push(line);
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function parseBlock(block: string[]): SalesNavLead | null {
  let connection: string | null = null;
  let fields: string[] = [];

  for (const raw of block) {
    const degree = raw.match(DEGREE);
    let line = raw;
    if (degree && !connection) {
      connection = degree[1].toLowerCase();
      line = raw.slice(0, degree.index).replace(/[\s·]+$/, "").trim();
      // The degree follows the name (same line or the line before), so
      // anything earlier in the block is page chrome (list name, headers).
      if (line) fields = [];
      else fields = fields.slice(-1);
    }
    if (!line || isNoise(line)) continue;
    fields.push(line);
  }

  // Order in both views: name, title, account, location. Some rows omit the
  // title; a trailing "City, State, Country" line is always the location.
  if (fields.length < 2) return null;
  const [rawName, ...rest] = fields;
  const location = rest.length && looksLikeLocation(rest[rest.length - 1]) ? (rest.pop() as string) : "";
  const [jobTitle = "", company = ""] = rest.length >= 2 ? rest : ["", rest[0] ?? ""];

  const name = tidyName(stripEllipsis(rawName));
  if (!name || name.split(" ").length > 6 || /\d/.test(name)) return null;

  return {
    key: `${name}|${company}`.toLowerCase(),
    name,
    jobTitle: stripEllipsis(jobTitle),
    company: stripEllipsis(company),
    location,
    connection,
  };
}

/** Parse pasted Sales Navigator text into leads (deduplicated). */
export function parseSalesNavigatorText(text: string): SalesNavLead[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, " ").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  return splitBlocks(lines)
    .map(parseBlock)
    .filter((lead): lead is SalesNavLead => Boolean(lead) && !seen.has(lead!.key) && Boolean(seen.add(lead!.key)));
}

/** "Chennai, Tamil Nadu, India" → { city, state, country }. */
export function splitLocation(location: string) {
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
  if (parts.length === 2) return { city: parts[0], state: null, country: parts[1] };
  return { city: parts[0] ?? null, state: null, country: null };
}
