/**
 * Project registry — the single place to add a new project to the Sales
 * Engine. Adding an entry to PROJECTS instantly makes the project selectable
 * in the discovery UI and applies its requirements to provider searches.
 * No core search, map, provider, or marker code needs to change.
 *
 * Requirements are generic, data-driven search hints merged into the provider
 * filters (see mergeProjectFilters):
 *  - industry   → default industry filter for the provider search
 *  - categories → selectable target categories (kept as category ids and used
 *                 as a hard post-filter; never concatenated into industry)
 *  - jobTitle   → fallback job_title filter when the user does not specify one
 *
 * The project name is never used as a data switch — every project follows the
 * exact same search → normalize → geocode → map pipeline.
 */

import {
  categorySearchHints,
  resolveCategoryIds,
  type SearchCategoryId,
} from "@/lib/categorySearch";

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
  /** Free-text keyword hints derived from selected categories (not industry). */
  keywords?: string;
  /** Resolved category ids for hard post-filtering after provider search. */
  categoryIds?: SearchCategoryId[];
}

/**
 * Combine a project's requirements with the user's selections into the
 * filters documented by the provider backend. Purely data-driven — behaves
 * identically for every project (unknown/absent projects simply contribute
 * no requirements).
 *
 * Categories are intentionally kept separate and must NEVER be concatenated
 * into the industry string. They are resolved into provider-friendly search
 * hints (industry + keywords) and passed back as `categoryIds` so the
 * discover route can apply a hard post-filter after provider search.
 */
export function mergeProjectFilters(
  project: ProjectConfig | undefined,
  user: UserFilters
): MergedFilters {
  const filters: MergedFilters = {};

  if (user.location?.trim()) filters.location = user.location.trim();

  // Resolve selected category chips → typed ids
  const selectedIds = resolveCategoryIds(
    Array.isArray(user.categories) ? user.categories : []
  );

  if (selectedIds.length > 0) {
    // Translate category ids into appropriate provider search hints
    const hints = categorySearchHints(selectedIds);
    // Use category-derived industry hint, falling back to project/user industry
    const industryBase = hints.industry ?? project?.requirements.industry ?? user.industry;
    if (industryBase?.trim()) filters.industry = industryBase.trim();
    // Pass category keywords as job-title hint only when no explicit job_title given
    if (!user.job_title?.trim() && !project?.requirements.jobTitle && hints.keywords) {
      filters.keywords = hints.keywords;
    }
  } else {
    // No category chips selected — use project industry + user industry only
    const seen = new Set<string>();
    const industryParts = [project?.requirements.industry, user.industry]
      .map((p) => p?.trim())
      .filter((p): p is string => Boolean(p))
      .filter((p) => {
        const key = p.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (industryParts.length > 0) filters.industry = industryParts.join(", ");
  }

  // User-specified job title wins; the project requirement is the fallback.
  const jobTitle = user.job_title?.trim() || project?.requirements.jobTitle?.trim() || "";
  if (jobTitle) filters.job_title = jobTitle;

  // Carry resolved ids forward so the discover route can post-filter
  filters.categoryIds = selectedIds;

  return filters;
}
