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

/** "Third-degree connection" — screen-reader text for the degree icon. */
const DEGREE_LABEL = /^(first|second|third)[-\s]degree connection$/i;

/** UI text that is never a lead field. */
const NOISE = [
  DEGREE_LABEL,
  // Screen-reader labels for icons: "Saved badge", "Open to work badge", …
  /\bbadge$/i,
  /^status is (online|offline|reachable|away).*$/i,
  /^(go to|view) .+('s)? profile$/i,
  /^.+ is reachable$/i,
  /^(premium|open to work|recently hired|new|hiring|verified)$/i,
  /^(\d+\s+)?(mutual connections?|shared connections?)$/i,
  /^(message|messaged|inmail)$/i,
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

const LABEL_DEGREE: Record<string, string> = { first: "1st", second: "2nd", third: "3rd" };

function parseBlock(block: string[]): SalesNavLead | null {
  let connection: string | null = null;
  let fields: string[] = [];

  // The connection degree follows the name, so it anchors the row: anything
  // earlier is page chrome (list name, column headers). Prefer the visible
  // "· 3rd" marker; fall back to the "Third-degree connection" label.
  const useVisibleMarker = block.some((line) => DEGREE.test(line));

  for (const raw of block) {
    const visible = raw.match(DEGREE);
    const label = raw.match(DEGREE_LABEL);
    const isAnchor = useVisibleMarker ? Boolean(visible) : Boolean(label);
    let line = raw;

    if (visible) line = raw.slice(0, visible.index).replace(/[\s·]+$/, "").trim();
    else if (label) line = "";
    if (isAnchor && !connection) {
      connection = visible ? visible[1].toLowerCase() : LABEL_DEGREE[label![1].toLowerCase()];
      fields = line ? [] : fields.slice(-1);
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
