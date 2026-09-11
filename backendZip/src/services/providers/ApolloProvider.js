/* eslint-disable no-unused-vars */

/**
 * ApolloProvider — Apollo implementation of the Sales Engine
 * provider abstraction.
 *
 * Supports:
 * 1. People Search
 * 2. People Enrichment
 *
 * Search is intended to find prospects.
 * Enrichment is used later to retrieve available contact data.
 */

const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const { apolloApiKey } = require('../../config/env');

const API_BASE = 'https://api.apollo.io/api/v1';

const SEARCH_PATH = '/mixed_people/api_search';
const ENRICH_PATH = '/people/match';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

/**
 * Apollo industry facet values.
 */
const KNOWN_INDUSTRIES = new Set([
  'hospitality',
  'food & beverages',
  'restaurants',
  'travel arrangements',
  'leisure, travel & tourism',
  'real estate',
]);

/**
 * User/project phrasing -> Apollo industry facet.
 */
const INDUSTRY_SYNONYMS = {
  hotels: 'hospitality',
  hotel: 'hospitality',
  resorts: 'hospitality',
  resort: 'hospitality',
  restaurants: 'restaurants',
  restaurant: 'restaurants',
  'property management': 'real estate',
};

/**
 * Convert a value into a valid coordinate.
 */
function toCoordinate(value) {
  const n =
    typeof value === 'string'
      ? Number(value)
      : value;

  return typeof n === 'number' &&
    Number.isFinite(n)
    ? n
    : null;
}

/**
 * Convert a filter value into a clean array.
 */
function asList(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((x) => String(x).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Return the first non-empty list from the
 * supplied filter keys.
 */
function pickList(filters, keys) {
  for (const key of keys) {
    const list = asList(filters[key]);

    if (list.length) {
      return list;
    }
  }

  return [];
}

class ApolloProvider extends BaseProvider {
  constructor() {
    super('apollo');

    this.apiKey = apolloApiKey;
    this.apiBase = API_BASE;

    this.http = axios.create({
      baseURL: API_BASE,
      timeout: DEFAULT_TIMEOUT_MS,

      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Check whether Apollo is configured.
   */
  isConfigured() {
    return Boolean(this.apiKey);
  }

  /**
   * ============================================================
   * PEOPLE SEARCH
   * ============================================================
   *
   * Apollo People Search.
   *
   * Search results intentionally do not invent
   * email addresses or phone numbers.
   */
  async searchPeople(filtersOrParams, page = 1) {
    this._ensureApiKey();

    let filters;
    let perPage;
    let requestPage;

    /**
     * Supports:
     *
     * searchPeople(filters, page)
     *
     * and:
     *
     * searchPeople({
     *   page,
     *   perPage,
     *   filters
     * })
     */
    if (
      filtersOrParams &&
      typeof filtersOrParams === 'object' &&
      !Array.isArray(filtersOrParams)
    ) {
      if (
        'filters' in filtersOrParams ||
        'page' in filtersOrParams ||
        'perPage' in filtersOrParams
      ) {
        ({
          page: requestPage = 1,
          perPage = DEFAULT_PER_PAGE,
          filters,
        } = filtersOrParams);
      } else {
        filters = filtersOrParams;
        requestPage = page;
        perPage = DEFAULT_PER_PAGE;
      }
    } else {
      filters = filtersOrParams || {};
      requestPage = page;
      perPage = DEFAULT_PER_PAGE;
    }

    const requestBody =
      this.buildSearchParams({
        page: requestPage,
        perPage,
        filters,
      });

    let response;

    try {
      response = await this.http.post(
        SEARCH_PATH,
        requestBody,
        {
          validateStatus: () => true,

          transformResponse: [
            this.safeParse,
          ],
        }
      );
    } catch (error) {
      throw this.mapError(error);
    }

    return this.normalizeSearchResponse(
      response,
      requestBody
    );
  }

  /**
   * Build Apollo People Search request.
   */
  buildSearchParams({
    page,
    perPage,
    filters,
  }) {
    const params = {
      page: Math.max(
        1,
        Number(page) || 1
      ),

      per_page:
        this._clampPerPage(perPage),
    };

    if (filters) {
      /**
       * Free-text search.
       */
      if (
        filters.query ||
        filters.q ||
        filters.keywords
      ) {
        params.q = String(
          filters.query ||
          filters.q ||
          filters.keywords
        );
      }

      /**
       * Job titles.
       */
      const jobTitles = pickList(
        filters,
        [
          'jobTitles',
          'jobTitle',
          'job_title',
        ]
      );

      if (jobTitles.length) {
        params.person_titles = jobTitles;
      }

      /**
       * Person locations.
       */
      const locations = pickList(
        filters,
        [
          'locations',
          'location',
        ]
      );

      if (locations.length) {
        params.person_locations =
          locations;
      }

      /**
       * Organization industries.
       */
      const rawIndustries = pickList(
        filters,
        [
          'industries',
          'industry',
        ]
      );

      if (rawIndustries.length) {
        const industries =
          rawIndustries.flatMap(
            (name) => {
              const lower =
                String(name)
                  .trim()
                  .toLowerCase();

              if (!lower) {
                return [];
              }

              if (
                INDUSTRY_SYNONYMS[
                lower
                ]
              ) {
                return [
                  INDUSTRY_SYNONYMS[
                  lower
                  ],
                ];
              }

              if (
                KNOWN_INDUSTRIES.has(
                  lower
                )
              ) {
                return [lower];
              }

              const words =
                lower
                  .split(
                    /[^a-z0-9&]+/
                  )
                  .filter(Boolean);

              if (!words.length) {
                return [name];
              }

              const title =
                words.map((word) =>
                  word === '&'
                    ? word
                    : word
                      .charAt(0)
                      .toUpperCase() +
                    word.slice(1)
                );

              return [
                title.join(' '),
                ...title,
              ];
            }
          );

        const unique = [
          ...new Set(industries),
        ];

        if (unique.length) {
          params.organization_industries =
            unique;
        }
      }

      /**
       * Organization names.
       */
      const companyNames = pickList(
        filters,
        [
          'companyNames',
          'companyName',
          'company_name',
        ]
      );

      if (companyNames.length) {
        params.organization_names =
          companyNames;
      }

      /**
       * Organization domains.
       */
      const domains = pickList(
        filters,
        [
          'domains',
          'domain',
          'companyWebsite',
          'company_website',
        ]
      );

      if (domains.length) {
        params.organization_domains =
          domains;
      }
    }

    return params;
  }

  /**
   * ============================================================
   * PEOPLE ENRICHMENT
   * ============================================================
   *
   * Enrich one Apollo person.
   *
   * The preferred identifier is the Apollo person ID
   * returned from People Search.
   */
  async enrichPerson({
    id,
    firstName,
    lastName,
    companyWebsite,
    email,
    linkedinUrl,
  }) {
    this._ensureApiKey();

    const params = {
      reveal_personal_emails: false,
      reveal_phone_number: false,
    };

    /**
     * Preferred:
     * Apollo person ID.
     */
    if (id) {
      params.id = String(id);
    }

    /**
     * Fallback identifiers.
     */
    else if (email) {
      params.email = String(email).trim();
    }

    else if (linkedinUrl) {
      params.linkedin_url =
        String(linkedinUrl).trim();
    }

    else {
      if (firstName) {
        params.first_name =
          String(firstName).trim();
      }

      if (lastName) {
        params.last_name =
          String(lastName).trim();
      }

      if (companyWebsite) {
        params.domain =
          this.extractDomain(
            companyWebsite
          );
      }
    }

    /**
     * Validate that we have enough
     * information to perform enrichment.
     */
    const hasIdentifier =
      Boolean(params.id) ||
      Boolean(params.email) ||
      Boolean(params.linkedin_url) ||
      Boolean(
        params.first_name &&
        params.last_name &&
        params.domain
      );

    if (!hasIdentifier) {
      const error = new Error(
        'Apollo enrichment requires an Apollo person ID, email, LinkedIn URL, or name plus company domain.'
      );

      error.code =
        'INVALID_ENRICHMENT_INPUT';

      error.statusCode = 400;
      error.provider = 'apollo';

      throw error;
    }

    let response;

    try {
      response = await this.http.post(
        ENRICH_PATH,
        null,
        {
          params,

          headers: {
            'Cache-Control':
              'no-cache',
          },

          validateStatus: () => true,

          transformResponse: [
            this.safeParse,
          ],
        }
      );
    } catch (error) {
      throw this.mapError(error);
    }

    /**
     * Apollo API error.
     */
    if (
      response.status < 200 ||
      response.status >= 300
    ) {
      const data =
        response.data || {};

      let message =
        `Apollo enrichment failed (HTTP ${response.status})`;

      if (
        Array.isArray(data.errors) &&
        data.errors.length
      ) {
        message =
          data.errors
            .map(
              (item) =>
                item.message ||
                String(item)
            )
            .join('; ');
      } else if (
        data.error ||
        data.message
      ) {
        message =
          data.error ||
          data.message;
      }

      const error =
        new Error(message);

      error.code =
        'APOLLO_ENRICHMENT_ERROR';

      error.statusCode =
        response.status;

      error.provider = 'apollo';

      error.response = data;

      throw error;
    }

    /**
     * Apollo returns the matched person
     * under data.person.
     */
    const person =
      response.data?.person;

    /**
     * No match.
     */
    if (!person) {
      return {
        data: {
          lead: null,
          matched: false,
        },
      };
    }

    const org =
      person.organization || {};

    /**
     * Build the same lead structure
     * used throughout Sales Engine.
     */
    const fullName =
      person.name ||
      [
        person.first_name,
        person.last_name,
      ]
        .filter(Boolean)
        .join(' ')
        .trim();

    const location = [
      person.city,
      person.state,
      person.country,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      data: {
        lead: {
          id: person.id
            ? String(person.id)
            : String(id || ''),

          firstName:
            person.first_name ||
            firstName ||
            '',

          lastName:
            person.last_name ||
            lastName ||
            '',

          fullName:
            fullName || '',

          jobTitle:
            person.title ||
            '',

          email:
            person.email ||
            '',

          emailStatus:
            person.email_status ||
            '',

          phone:
            person.phone ||
            person.phone_number ||
            '',

          linkedinUrl:
            person.linkedin_url ||
            linkedinUrl ||
            '',

          companyName:
            org.name ||
            org.organization_name ||
            '',

          companyWebsite:
            org.primary_domain ||
            org.domain ||
            org.url ||
            companyWebsite ||
            '',

          industry:
            org.industry ||
            person.industry ||
            '',

          location:
            location ||
            person.location ||
            '',

          state:
            person.state ||
            '',

          country:
            person.country ||
            '',

          latitude:
            toCoordinate(
              person.latitude ??
              person.geo?.latitude ??
              person.lat
            ),

          longitude:
            toCoordinate(
              person.longitude ??
              person.geo?.longitude ??
              person.lng
            ),

          source: 'apollo',

          rawData: person,
        },

        matched: true,
      },
    };
  }

  /**
   * Extract a clean domain from a website.
   *
   * Example:
   *
   * https://www.example.com/about
   *
   * becomes:
   *
   * example.com
   */
  extractDomain(value) {
    if (!value) {
      return '';
    }

    try {
      const input =
        String(value).trim();

      if (!input) {
        return '';
      }

      const normalized =
        input.startsWith('http')
          ? input
          : `https://${input}`;

      return new URL(
        normalized
      ).hostname
        .replace(/^www\./, '');
    } catch {
      return String(value)
        .trim()
        .replace(
          /^https?:\/\//,
          ''
        )
        .replace(
          /^www\./,
          ''
        )
        .split('/')[0];
    }
  }

  /**
   * Normalize Apollo Search response.
   */
  normalizeSearchResponse(
    response,
    requestBody
  ) {
    const status =
      response.status;

    const data =
      response.data || {};

    /**
     * Non-2xx response.
     */
    if (
      status < 200 ||
      status >= 300
    ) {
      let message =
        `Apollo API request failed (HTTP ${status})`;

      let code =
        'APOLLO_API_ERROR';

      if (data) {
        if (
          Array.isArray(
            data.errors
          ) &&
          data.errors.length
        ) {
          message =
            data.errors
              .map(
                (e) =>
                  e.message ||
                  String(e)
              )
              .join('; ');

          code =
            data.errors[0]
              ?.extensions
              ?.code ||
            data.errors[0]
              ?.code ||
            code;
        }

        else if (
          data.error ||
          data.message
        ) {
          message =
            data.error ||
            data.message;
        }
      }

      const error =
        new Error(message);

      error.code = code;
      error.statusCode = status;
      error.provider = 'apollo';
      error.response = data;

      throw error;
    }

    const people =
      Array.isArray(data.people)
        ? data.people
        : [];

    const total =
      Number(
        data.total_entries
      ) || 0;

    const perPage =
      requestBody.per_page ||
      DEFAULT_PER_PAGE;

    const currentPage =
      Number(
        requestBody.page
      ) || 1;

    const items =
      people
        .map((person) =>
          this.normalizePerson(
            person
          )
        )
        .filter(Boolean);

    return {
      data: {
        items,
        total,
        page: currentPage,
        perPage,
      },
    };
  }

  /**
   * Transform one Apollo person
   * into the common Sales Engine
   * lead structure.
   */
  normalizePerson(person) {
    if (
      !person ||
      typeof person !== 'object'
    ) {
      return null;
    }

    const org =
      person.organization || {};

    const fullName = [
      person.first_name,
      person.last_name_obfuscated ||
      person.last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    /**
     * Build complete location.
     *
     * Previously only city was used.
     *
     * Now:
     *
     * Berlin, Berlin, Germany
     */
    const location = [
      person.city,
      person.state,
      person.country,
    ]
      .filter(Boolean)
      .join(', ');

    return {
      id: person.id
        ? String(person.id)
        : '',

      firstName:
        person.first_name ||
        person.firstName ||
        '',

      lastName:
        person.last_name_obfuscated ||
        person.last_name ||
        person.lastName ||
        '',

      fullName:
        fullName || '',

      jobTitle:
        person.title ||
        person.job_title ||
        null,

      /**
       * Apollo Search does not expose
       * the real email.
       *
       * Never invent one.
       */
      email: '',

      emailStatus: '',

      /**
       * Phone is also not returned by
       * normal Apollo Search.
       */
      phone: '',

      linkedinUrl:
        person.linkedin_url ||
        '',

      companyName:
        org.name ||
        org.organization_name ||
        '',

      companyWebsite:
        org.domain ||
        org.url ||
        '',

      industry:
        org.industry ||
        person.industry ||
        '',

      location:
        location ||
        person.location ||
        '',

      state:
        person.state ||
        '',

      country:
        person.country ||
        '',

      latitude:
        toCoordinate(
          person.latitude ??
          person.geo?.latitude ??
          person.lat
        ),

      longitude:
        toCoordinate(
          person.longitude ??
          person.geo?.longitude ??
          person.lng
        ),

      /**
       * Apollo availability flags.
       */
      has_email:
        Boolean(
          person.has_email
        ),

      has_phone:
        Boolean(
          person.has_direct_phone ||
          org.has_phone
        ),

      rawData: person,
    };
  }

  /**
   * Convert provider/network errors
   * into Sales Engine errors.
   */
  mapError(error) {
    if (
      !error ||
      !error.code
    ) {
      return Object.assign(
        new Error(
          'Apollo request failed for an unknown reason.'
        ),
        {
          code:
            'APOLLO_REQUEST_ERROR',

          statusCode: 500,

          provider: 'apollo',
        }
      );
    }

    switch (error.code) {
      case 'ECONNABORTED':
      case 'ETIMEDOUT':
        return Object.assign(
          new Error(
            'Apollo request timed out.'
          ),
          {
            code:
              'APOLLO_TIMEOUT',

            statusCode: 504,

            provider: 'apollo',
          }
        );

      case 'ECONNREFUSED':
      case 'ENOTFOUND':
        return Object.assign(
          new Error(
            'Unable to reach Apollo API.'
          ),
          {
            code:
              'APOLLO_NETWORK_ERROR',

            statusCode: 502,

            provider: 'apollo',
          }
        );

      default:
        return Object.assign(
          error,
          {
            provider: 'apollo',
          }
        );
    }
  }

  /**
   * Ensure Apollo API key exists.
   */
  _ensureApiKey() {
    if (!this.isConfigured()) {
      const error =
        new Error(
          'Apollo provider is not configured (APOLLO_API_KEY is missing).'
        );

      error.code =
        'PROVIDER_NOT_CONFIGURED';

      error.statusCode = 503;
      error.provider = 'apollo';

      throw error;
    }
  }

  /**
   * Keep per-page within Apollo limits.
   */
  _clampPerPage(value) {
    const n = Number(value);

    if (
      !Number.isFinite(n) ||
      n < 1
    ) {
      return DEFAULT_PER_PAGE;
    }

    return Math.min(
      MAX_PER_PAGE,
      n
    );
  }

  /**
   * Safely parse JSON responses.
   */
  safeParse(data) {
    if (
      typeof data === 'object' &&
      data !== null
    ) {
      return data;
    }

    if (!data) {
      return {};
    }

    if (
      typeof data === 'string'
    ) {
      try {
        return JSON.parse(data);
      } catch (e) {
        return {};
      }
    }

    return {};
  }
}

module.exports = ApolloProvider;