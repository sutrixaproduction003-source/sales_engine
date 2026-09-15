/**
 * Category search helpers.
 *
 * Overview chips ("Hotels", "Resorts", …) must stay as category filters,
 * not get concatenated into a provider industry string. Provider search is
 * only a pre-filter; matching company/job-title evidence is the guarantee
 * that "Hotels" returns hotels.
 */

export type SearchCategoryId =
  | "hotel"
  | "resort"
  | "restaurant"
  | "spa"
  | "service_apartment"
  | "hospitality_group"
  | "property_management"
  | "hotel_consultant"
  | "wedding_event_manager"
  | "fb_consultant"
  | "fb_supplier"
  | "training_institute";

export interface CategorySearchHints {
  industry?: string;
  keywords?: string;
}

export interface CategoryMatchLead {
  companyName?: string | null;
  hotelName?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  category?: string | null;
  subCategory?: string | null;
}

const CATEGORY_ALIASES: Record<string, SearchCategoryId> = {
  hotel: "hotel",
  hotels: "hotel",
  resort: "resort",
  resorts: "resort",
  restaurant: "restaurant",
  restaurants: "restaurant",
  spa: "spa",
  spas: "spa",
  "service apartment": "service_apartment",
  "service apartments": "service_apartment",
  "serviced apartment": "service_apartment",
  "serviced apartments": "service_apartment",
  "hospitality groups": "hospitality_group",
  "hospitality group": "hospitality_group",
  "property management": "property_management",
  hotel_consultant: "hotel_consultant",
  "hotel consultant": "hotel_consultant",
  wedding_event_manager: "wedding_event_manager",
  "wedding / event manager": "wedding_event_manager",
  fb_consultant: "fb_consultant",
  "f&b consultant": "fb_consultant",
  fb_supplier: "fb_supplier",
  "f&b supplier": "fb_supplier",
  training_institute: "training_institute",
  "training institute": "training_institute",
};

const CATEGORY_HINTS: Record<SearchCategoryId, CategorySearchHints> = {
  hotel: { industry: "hospitality", keywords: "hotel" },
  resort: { industry: "hospitality", keywords: "resort" },
  restaurant: { industry: "restaurants", keywords: "restaurant" },
  spa: { industry: "wellness", keywords: "spa" },
  service_apartment: { industry: "hospitality", keywords: "serviced apartment" },
  hospitality_group: { industry: "hospitality", keywords: "hospitality group" },
  property_management: { industry: "real estate", keywords: "property management" },
  hotel_consultant: { industry: "hospitality", keywords: "hotel consultant" },
  wedding_event_manager: { industry: "events services", keywords: "wedding planner" },
  fb_consultant: { industry: "food & beverages", keywords: "restaurant consultant" },
  fb_supplier: { industry: "food & beverages", keywords: "food supplier" },
  training_institute: { industry: "education", keywords: "hotel management institute" },
};

const HOTEL_COMPANY_TOKENS = [
  "hotel",
  "hotels",
  "inn",
  "lodge",
  "motel",
  "guesthouse",
  "guest house",
  "boutique hotel",
  "heritage hotel",
];

const HOTEL_BRANDS = [
  "marriott",
  "hilton",
  "hyatt",
  "ihg",
  "accor",
  "radisson",
  "sheraton",
  "westin",
  "novotel",
  "ibis",
  "holiday inn",
  "crowne plaza",
  "four seasons",
  "ritz carlton",
  "intercontinental",
  "kempinski",
  "shangri",
  "oberoi",
  "taj",
  "leela",
  "itc hotels",
  "vivanta",
  "lemon tree",
  "sarovar",
  "fortune hotel",
  "ginger",
  "oyo",
  "treebo",
  "fairmont",
  "sofitel",
  "pullman",
  "mercure",
  "ramada",
  "wyndham",
  "best western",
];

const HOTEL_TITLES = [
  "hotel manager",
  "hotel director",
  "hotel general manager",
  "hotel owner",
  "hotel operations",
  "rooms division",
  "front office manager",
  "front office director",
  "director of rooms",
  "hotel revenue",
  "hotel sales",
];

const RESORT_TOKENS = ["resort", "resorts", "retreat"];
const RESTAURANT_TOKENS = [
  "restaurant",
  "restaurants",
  "cafe",
  "café",
  "bistro",
  "eatery",
  "diner",
  "qsr",
];
const SPA_TOKENS = ["spa", "wellness", "ayurveda"];
const SERVICE_APARTMENT_TOKENS = [
  "serviced apartment",
  "service apartment",
  "aparthotel",
  "extended stay",
];
const HOSPITALITY_GROUP_TOKENS = [
  "hospitality group",
  "hotel group",
  "hotels group",
  "resort group",
  "hotels & resorts",
  "hotels and resorts",
  "hotel chain",
];
const PROPERTY_MANAGEMENT_TOKENS = [
  "property management",
  "property manager",
  "realty",
  "real estate",
];

function normalize(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function hasToken(text: string, token: string): boolean {
  const haystack = normalize(text);
  const needle = normalize(token);
  if (!haystack || !needle) return false;
  if (needle.includes(" ")) return haystack.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`).test(haystack);
}

function hasAny(text: string, tokens: string[]): boolean {
  return tokens.some((token) => hasToken(text, token));
}

function companyText(lead: CategoryMatchLead): string {
  return `${normalize(lead.companyName)} ${normalize(lead.hotelName)}`.trim();
}

function titleText(lead: CategoryMatchLead): string {
  return normalize(lead.jobTitle);
}

function industryText(lead: CategoryMatchLead): string {
  return normalize(lead.industry);
}

export function resolveCategoryIds(raw: unknown): SearchCategoryId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<SearchCategoryId>();
  for (const value of raw) {
    const key = normalize(value);
    const id = CATEGORY_ALIASES[key] ?? CATEGORY_ALIASES[key.replace(/_/g, " ")];
    if (id) seen.add(id);
  }
  return Array.from(seen);
}

export function categorySearchHints(ids: SearchCategoryId[]): CategorySearchHints {
  const industries = new Set<string>();
  const keywords = new Set<string>();
  for (const id of ids) {
    const hints = CATEGORY_HINTS[id];
    if (hints?.industry) industries.add(hints.industry);
    if (hints?.keywords) keywords.add(hints.keywords);
  }
  return {
    industry: Array.from(industries).join(", ") || undefined,
    keywords: Array.from(keywords).join(", ") || undefined,
  };
}

function matchesHotel(lead: CategoryMatchLead): boolean {
  const company = companyText(lead);
  const title = titleText(lead);
  const industry = industryText(lead);
  if (hasAny(company, HOTEL_COMPANY_TOKENS) || hasAny(company, HOTEL_BRANDS)) return true;
  if (hasAny(title, HOTEL_TITLES) && !hasAny(company, RESTAURANT_TOKENS)) return true;
  return hasAny(industry, ["hotels", "lodging", "accommodation"]);
}

function matchesCategory(lead: CategoryMatchLead, id: SearchCategoryId): boolean {
  const classified = normalize(lead.subCategory);
  if (classified === id) {
    if (id === "hotel") return matchesHotel(lead);
    if (id === "resort") return hasAny(companyText(lead), RESORT_TOKENS) || classified === "resort";
  }

  const company = companyText(lead);
  const title = titleText(lead);
  const industry = industryText(lead);

  switch (id) {
    case "hotel":
      return matchesHotel(lead);
    case "resort":
      return hasAny(company, RESORT_TOKENS) || hasAny(title, ["resort manager", "resort director", "resort owner"]);
    case "restaurant":
      return hasAny(company, RESTAURANT_TOKENS) || hasAny(title, ["restaurant manager", "restaurant owner", "f&b manager"]);
    case "spa":
      return hasAny(company, SPA_TOKENS) || hasAny(title, ["spa manager", "spa director", "wellness manager"]);
    case "service_apartment":
      return hasAny(company, SERVICE_APARTMENT_TOKENS);
    case "hospitality_group":
      return hasAny(company, HOSPITALITY_GROUP_TOKENS);
    case "property_management":
      return hasAny(company, PROPERTY_MANAGEMENT_TOKENS) || hasAny(title, ["property manager"]);
    case "hotel_consultant":
      return hasAny(company, ["hotel consultant", "hospitality consultant"]) ||
        hasAny(title, ["hotel consultant", "hospitality consultant"]);
    case "wedding_event_manager":
      return hasAny(company, ["wedding", "event management"]) ||
        hasAny(title, ["wedding planner", "event manager", "event planner"]);
    case "fb_consultant":
      return hasAny(company, ["f&b consultant", "restaurant consultant"]) ||
        hasAny(title, ["f&b consultant", "restaurant consultant"]);
    case "fb_supplier":
      return hasAny(company, ["food supplier", "beverage supplier", "food distributor"]) ||
        hasAny(industry, ["food distribution", "beverage distribution"]);
    case "training_institute":
      return hasAny(company, ["hospitality institute", "hotel management", "hospitality academy", "hotel school"]);
    default:
      return false;
  }
}

/**
 * True when no categories are selected (do not filter) or the lead matches
 * at least one selected category. Matching is an OR across selected chips.
 */
export function leadMatchesCategories(
  lead: CategoryMatchLead,
  selected: SearchCategoryId[]
): boolean {
  if (!selected.length) return true;
  return selected.some((id) => matchesCategory(lead, id));
}
