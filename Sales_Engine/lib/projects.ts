/**
 * Project registry — the single place to add a new project to the Sales
 * Engine. Adding an entry to PROJECTS makes it selectable in discovery.
 *
 * Requirements are generic, data-driven search hints:
 *  - categories → business types scraped from Google Maps for a location
 *                 (see getProjectSearchTerms), selectable as chips
 *  - industry / jobTitle → hints for provider people searches
 *
 * The project name is never used as a data switch.
 */

export interface ProjectRequirements {
  industry?: string;
  categories?: string[];
  jobTitle?: string;
}

/**
 * Provider names supported by the EXISTING provider backend (backendZip
 * providerFactory). Kept in sync with that list — no other values may be
 * sent to POST /api/leads/search.
 */
export type ProviderName = "apollo";

export const SUPPORTED_PROVIDERS: ProviderName[] = ["apollo"];

/**
 * Fallback provider used when a project does not declare one and the request
 * carries no explicit override.
 */
export const DEFAULT_PROVIDER: ProviderName = "apollo";

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  requirements: ProjectRequirements;
  /**
   * Provider this project's discovery searches are routed through. When
   * omitted, DEFAULT_PROVIDER is used (see getProjectProvider).
   */
  provider?: ProviderName;
}

export const PROJECTS: ProjectConfig[] = [
  {
    id: "rizstay",
    name: "Rizstay",
    description: "Hospitality & property outreach (hotels, resorts, restaurants).",
    requirements: {
      categories: ["Hotels", "Resorts", "Restaurants", "Hospitality Groups", "Property Management"],
    },
    provider: "apollo",
  },
  {
    id: "general",
    name: "General Sales",
    description: "Open prospecting across any industry or location.",
    requirements: {},
    provider: "apollo",
  },
];

/**
 * Google Maps search terms for a location scrape: the selected project
 * categories (all of the project's categories when none are selected) plus an
 * optional free-text business type. Unknown categories are ignored.
 */
export function getProjectSearchTerms(
  project: ProjectConfig | undefined,
  selectedCategories: string[] = [],
  keyword = ""
): string[] {
  const projectCategories = project?.requirements.categories ?? [];
  const chosen = selectedCategories.filter((c) => projectCategories.includes(c));
  const terms = [...(chosen.length ? chosen : projectCategories), keyword.trim()].filter(Boolean);
  return Array.from(new Set(terms.map((term) => term.toLowerCase())));
}

export function getProject(id: string | null | undefined): ProjectConfig | undefined {
  return PROJECTS.find((p) => p.id === id);
}

/**
 * Resolve the provider for a discovery search, purely data-driven:
 *  1. explicit override supplied with the request (if it is a supported name),
 *  2. the selected project's configured provider,
 *  3. DEFAULT_PROVIDER.
 * Unsupported overrides are ignored (never forwarded to the backend) so the
 * request always carries a provider the backend's providerFactory supports.
 */
export function getProjectProvider(
  project: ProjectConfig | undefined,
  override?: string | null
): ProviderName {
  if (override && (SUPPORTED_PROVIDERS as string[]).includes(override)) {
    return override as ProviderName;
  }
  return project?.provider ?? DEFAULT_PROVIDER;
}
