/**
 * LinkedIn Sales Navigator deep links.
 *
 * Sales Navigator has no public search API (only LinkedIn's partner-only SNAP
 * program), so discovery opens a pre-filled Sales Navigator people search in
 * the user's own signed-in session instead of pulling results into the app.
 * Nothing here calls LinkedIn or scrapes it.
 */

const PEOPLE_SEARCH_URL = "https://www.linkedin.com/sales/search/people";

export interface SalesNavigatorFilters {
  jobTitle?: string;
  company?: string;
  location?: string;
  industry?: string;
  keywords?: string;
}

/**
 * Escape a value for Sales Navigator's Rest.li query syntax, where
 * parentheses, commas and colons are structural.
 */
function restliValue(value: string): string {
  return encodeURIComponent(value).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/g, "%27");
}

/** Split "General Manager, Owner" into ["General Manager", "Owner"]. */
function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A free-text include filter, e.g. CURRENT_TITLE or CURRENT_COMPANY. */
function textFilter(type: string, values: string[]): string | null {
  if (values.length === 0) return null;
  const list = values.map((text) => `(text:${restliValue(text)},selectionType:INCLUDED)`).join(",");
  return `(type:${type},values:List(${list}))`;
}

/**
 * Build a Sales Navigator people-search URL. Job titles and companies map to
 * Sales Navigator's text filters; location, industry and other keywords go
 * into the keyword search, because Sales Navigator's geography and industry
 * filters need LinkedIn-internal IDs that are not public.
 */
export function buildSalesNavigatorSearchUrl(filters: SalesNavigatorFilters): string {
  const keywords = [filters.keywords, filters.industry, filters.location]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");

  const filterParts = [
    textFilter("CURRENT_TITLE", splitList(filters.jobTitle)),
    textFilter("CURRENT_COMPANY", splitList(filters.company)),
  ].filter((part): part is string => part !== null);

  const queryParts = ["spellCorrectionEnabled:true"];
  if (keywords) queryParts.push(`keywords:${restliValue(keywords)}`);
  if (filterParts.length) queryParts.push(`filters:List(${filterParts.join(",")})`);

  return `${PEOPLE_SEARCH_URL}?query=(${queryParts.join(",")})`;
}
