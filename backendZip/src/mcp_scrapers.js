/**
 * Model Context Protocol (MCP) stdio server exposing the Apify social & travel
 * scrapers (Instagram, Facebook, Google Maps reviews, MakeMyTrip).
 *
 * Run with: npm run mcp
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { scrape } = require('./services/apifyScrapers');

const stringProp = (description) => ({ type: 'string', description });
const numberProp = (description) => ({ type: 'number', description });

/**
 * MCP tools, each backed by a scraper type from services/apifyScrapers.
 * `summarize` shapes the JSON returned to the MCP client.
 */
const TOOLS = {
  scrape_instagram: {
    scraper: 'instagram',
    description:
      'Scrape an Instagram profile for public information (followers, bio, recent posts) using Apify (apify/instagram-profile-scraper).',
    properties: { username: stringProp('The Instagram username or handle to scrape.') },
    required: ['username'],
    summarize: (args, data) => ({ profile: args.username, resultsFound: data.length }),
  },
  scrape_facebook: {
    scraper: 'facebook',
    description:
      'Scrape a public Facebook page for business details and recent activity using Apify (apify/facebook-pages-scraper).',
    properties: {
      pageUrl: stringProp('The URL of the Facebook page to scrape.'),
      maxPosts: numberProp('Maximum number of posts to scrape.'),
    },
    required: ['pageUrl'],
    summarize: (args, data) => ({ pageUrl: args.pageUrl, pagesFound: data.length }),
  },
  scrape_google_maps_reviews: {
    scraper: 'googleMapsReviews',
    description: 'Scrape public Google Maps reviews using Apify (kaix/google-maps-reviews-scraper).',
    properties: {
      placeUrl: stringProp('The Google Maps place URL to scrape reviews from.'),
      maxReviews: numberProp('Maximum number of reviews to extract.'),
    },
    required: ['placeUrl'],
    summarize: (args, data) => ({ placeUrl: args.placeUrl, reviewsFound: data.length }),
  },
  scrape_makemytrip: {
    scraper: 'makemytripReviews',
    description:
      'Scrape hotel reviews from MakeMyTrip using Apify (krazee_kaushik/makemytrip-hotel-reviews-scraper).',
    properties: {
      hotelUrl: stringProp('The full MakeMyTrip hotel URL to scrape reviews from.'),
      maxReviews: numberProp('Maximum number of reviews to extract.'),
    },
    required: ['hotelUrl'],
    summarize: (args, data) => ({ hotelUrl: args.hotelUrl, reviewsFound: data.length }),
  },
  scrape_makemytrip_hotels: {
    scraper: 'makemytripHotels',
    description: 'Scrape hotel listings from MakeMyTrip using Apify (krazee_kaushik/makemytrip-hotels-scraper).',
    properties: {
      searchUrl: stringProp(
        'The full MakeMyTrip search URL to scrape hotel listings from (e.g. for a specific city).'
      ),
      maxItems: numberProp('Maximum number of hotels to extract.'),
    },
    required: ['searchUrl'],
    summarize: (args, data) => ({ searchUrl: args.searchUrl, hotelsFound: data.length }),
  },
};

const server = new Server({ name: 'social-travel-scrapers', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(TOOLS).map(([name, tool]) => ({
    name,
    description: tool.description,
    inputSchema: { type: 'object', properties: tool.properties, required: tool.required },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    const tool = TOOLS[name];
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const data = await scrape(tool.scraper, args);
    const result = { ...tool.summarize(args, data), status: 'Success', data };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error executing ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
  // stdout carries the MCP protocol; log to stderr.
  console.error('Social & Travel Scraper MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in MCP server:', error);
  process.exit(1);
});
