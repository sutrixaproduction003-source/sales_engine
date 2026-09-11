/**
 * Project registry — the single place to add a new project to the Sales
 * Engine. Adding an entry to PROJECTS instantly makes the project selectable
 * in the discovery UI and applies its requirements to provider searches.
 * No core search, map, provider, or marker code needs to change.
 *
 * Requirements are generic, data-driven search hints merged into the provider
 * filters (see mergeProjectFilters):
 *  - industry   → default industry filter for the provider search
 *  - categories → selectable target categories (merged into the industry filter)
 *  - jobTitle   → fallback job_title filter when the user does not specify one
 *
 * The project name is never used as a data switch — every project follows the
 * exact same search → normalize → geocode → map pipeline.
 */

export interface ProjectRequirements {
  industry?: string;
  categories?: string[];
  jobTitle?: string;
}

/**
 * Provider names supported by the EXISTING provider backend (backendZip
 * providerFactory: apollo | hunter | prospeo). Kept in sync with that list —
 * no other values may be sent to POST /api/leads/search.
 */
export type ProviderName = "prospeo" | "hunter" | "apollo";

export const SUPPORTED_PROVIDERS: ProviderName[] = ["prospeo", "hunter", "apollo"];

/**
 * Fallback provider used when a project does not declare one and the request
 * carries no explicit override. Both Prospeo and Apollo implement people
 * search (Hunter does not), but Prospeo remains the safe default because it
 * is the only provider that returns real contact data (emails) in its search
 * results.
 */
export const DEFAULT_PROVIDER: ProviderName = "prospeo";

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
    provider: "prospeo",
  },
  {
    id: "general",
    name: "General Sales",
    description: "Open prospecting across any industry or location.",
    requirements: {},
    provider: "prospeo",
  },
];

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

/** Raw filters as collected from the UI (all optional). */
export interface UserFilters {
  location?: string;
  industry?: string;
  categories?: string[];
  job_title?: string;
}

/** Filters documented by the provider backend (API.md): location, industry, job_title. */
export interface MergedFilters {
  location?: string;
  industry?: string;
  job_title?: string;
}

/**
 * Combine a project's requirements with the user's selections into the
 * filters documented by the provider backend. Purely data-driven — behaves
 * identically for every project (unknown/absent projects simply contribute
 * no requirements).
 */
export function mergeProjectFilters(
  project: ProjectConfig | undefined,
  user: UserFilters
): MergedFilters {
  const filters: MergedFilters = {};

  if (user.location?.trim()) filters.location = user.location.trim();

  // Project industry + user industry + selected categories, deduplicated.
  const seen = new Set<string>();
  const industryParts = [
    project?.requirements.industry,
    user.industry,
    ...(Array.isArray(user.categories) ? user.categories : []),
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (industryParts.length > 0) filters.industry = industryParts.join(", ");

  // User-specified job title wins; the project requirement is the fallback.
  const jobTitle = user.job_title?.trim() || project?.requirements.jobTitle?.trim() || "";
  if (jobTitle) filters.job_title = jobTitle;

  return filters;
}
