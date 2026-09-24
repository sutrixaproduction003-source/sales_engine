/**
 * Search providers for lead discovery
 * Supports: Apollo, Hunter, DuckDuckGo (OSINT), and other connectors
 */

export type SearchProvider = "apollo" | "hunter" | "duckduckgo" | "prospeo";

export interface SearchFilters {
  location?: string;
  industry?: string;
  jobTitle?: string;
  keywords?: string;
  company?: string;
  hotelName?: string;
  brandType?: string;
  propertySizeCategory?: string;
}

export interface SearchResult {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  industry?: string;
  linkedinUrl?: string;
  website?: string;
  source?: string;
  score?: number;
  verified?: boolean;
}

export const SEARCH_PROVIDERS = {
  apollo: {
    label: "Apollo.io",
    description: "Paid B2B database with verified contacts",
    icon: "database",
    available: true,
  },
  hunter: {
    label: "Hunter.io",
    description: "Email finder and domain search",
    icon: "mail",
    available: true,
  },
  duckduckgo: {
    label: "DuckDuckGo (OSINT)",
    description: "Free OSINT search engine for lead research",
    icon: "search",
    available: true,
  },
  prospeo: {
    label: "Prospeo",
    description: "Email & phone finder for B2B sales",
    icon: "phone",
    available: true,
  },
};

export const AVAILABLE_PROVIDERS = Object.keys(SEARCH_PROVIDERS) as SearchProvider[];
