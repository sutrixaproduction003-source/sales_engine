/**
 * Search providers for lead discovery.
 *  - apollo:          API search through the provider backend; results are
 *                     pulled into the app and saved to the pipeline.
 *  - salesnavigator:  LinkedIn Sales Navigator deep link — opens a pre-filled
 *                     search in the user's own Sales Navigator seat.
 */

export type SearchProvider = "apollo" | "salesnavigator";

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

export interface SearchProviderConfig {
  label: string;
  description: string;
  /** "api" results come back into the app; "link" opens the provider's own UI. */
  kind: "api" | "link";
}

export const SEARCH_PROVIDERS: Record<SearchProvider, SearchProviderConfig> = {
  apollo: {
    label: "Apollo.io",
    description: "Paid B2B database with verified contacts",
    kind: "api",
  },
  salesnavigator: {
    label: "LinkedIn Sales Navigator",
    description: "Opens a pre-filled people search in your Sales Navigator account",
    kind: "link",
  },
};

export const AVAILABLE_PROVIDERS = Object.keys(SEARCH_PROVIDERS) as SearchProvider[];

/** Providers searched through the provider backend (POST /api/leads/search). */
export const API_PROVIDERS = AVAILABLE_PROVIDERS.filter((provider) => SEARCH_PROVIDERS[provider].kind === "api");
