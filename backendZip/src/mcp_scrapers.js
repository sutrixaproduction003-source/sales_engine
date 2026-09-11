const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const axios = require("axios");

/**
 * Model Context Protocol (MCP) Server for Social & Travel Scraping
 * Exposes scraping capabilities for Instagram, Facebook, and MakeMyTrip.
 * Note: To run this server, you'll need to install the MCP SDK:
 * npm install @modelcontextprotocol/sdk
 */

const server = new Server(
  {
    name: "social-travel-scrapers",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "scrape_instagram",
        description: "Scrape an Instagram profile for public information (followers, bio, recent posts) using Apify (apify/instagram-profile-scraper).",
        inputSchema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "The Instagram username or handle to scrape.",
            },
          },
          required: ["username"],
        },
      },
      {
        name: "scrape_facebook",
        description: "Scrape a public Facebook page for business details and recent activity using Apify (apify/facebook-pages-scraper).",
        inputSchema: {
          type: "object",
          properties: {
            pageUrl: {
              type: "string",
              description: "The URL of the Facebook page to scrape.",
            },
            maxPosts: {
              type: "number",
              description: "Maximum number of posts to scrape.",
            }
          },
          required: ["pageUrl"],
        },
      },
      {
        name: "scrape_google_maps_reviews",
        description: "Scrape public Google Maps reviews using Apify (kaix/google-maps-reviews-scraper).",
        inputSchema: {
          type: "object",
          properties: {
            placeUrl: {
              type: "string",
              description: "The Google Maps place URL to scrape reviews from.",
            },
            maxReviews: {
              type: "number",
              description: "Maximum number of reviews to extract.",
            },
          },
          required: ["placeUrl"],
        },
      },
      {
        name: "scrape_makemytrip",
        description: "Scrape hotel reviews from MakeMyTrip using Apify (krazee_kaushik/makemytrip-hotel-reviews-scraper).",
        inputSchema: {
          type: "object",
          properties: {
            hotelUrl: {
              type: "string",
              description: "The full MakeMyTrip hotel URL to scrape reviews from.",
            },
            maxReviews: {
              type: "number",
              description: "Maximum number of reviews to extract.",
            }
          },
          required: ["hotelUrl"],
        },
      },
      {
        name: "scrape_makemytrip_hotels",
        description: "Scrape hotel listings from MakeMyTrip using Apify (krazee_kaushik/makemytrip-hotels-scraper).",
        inputSchema: {
          type: "object",
          properties: {
            searchUrl: {
              type: "string",
              description: "The full MakeMyTrip search URL to scrape hotel listings from (e.g. for a specific city).",
            },
            maxItems: {
              type: "number",
              description: "Maximum number of hotels to extract.",
            }
          },
          required: ["searchUrl"],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "scrape_instagram": {
        const username = args.username;
        const APIFY_TOKEN = process.env.APIFY_TOKEN;

        if (!APIFY_TOKEN) {
          throw new Error("Missing APIFY_TOKEN in environment. Required to run apify/instagram-profile-scraper.");
        }

        try {
          const runResponse = await axios.post(
            `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs?token=${APIFY_TOKEN}`,
            {
              usernames: [username]
            }
          );
          
          const runId = runResponse.data.data.id;
          
          let status = "RUNNING";
          while (status === "RUNNING" || status === "READY") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const checkResponse = await axios.get(
              `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/runs/${runId}?token=${APIFY_TOKEN}`
            );
            status = checkResponse.data.data.status;
          }

          if (status !== "SUCCEEDED") {
            throw new Error(`Apify run finished with status: ${status}`);
          }

          const defaultDatasetId = runResponse.data.data.defaultDatasetId;
          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  profile: username,
                  status: "Success",
                  resultsFound: datasetResponse.data.length,
                  data: datasetResponse.data
                }, null, 2),
              },
            ],
          };
        } catch (apifyErr) {
          throw new Error(`Failed to execute Apify Instagram scraper: ${apifyErr.message}`);
        }
      }

      case "scrape_facebook": {
        const pageUrl = args.pageUrl;
        const maxPosts = args.maxPosts || 10;
        const APIFY_TOKEN = process.env.APIFY_TOKEN;

        if (!APIFY_TOKEN) {
          throw new Error("Missing APIFY_TOKEN in environment. Required to run apify/facebook-pages-scraper.");
        }

        try {
          const runResponse = await axios.post(
            `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/runs?token=${APIFY_TOKEN}`,
            {
              startUrls: [{ url: pageUrl }],
              resultsLimit: maxPosts
            }
          );
          
          const runId = runResponse.data.data.id;
          
          let status = "RUNNING";
          while (status === "RUNNING" || status === "READY") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const checkResponse = await axios.get(
              `https://api.apify.com/v2/acts/apify~facebook-pages-scraper/runs/${runId}?token=${APIFY_TOKEN}`
            );
            status = checkResponse.data.data.status;
          }

          if (status !== "SUCCEEDED") {
            throw new Error(`Apify run finished with status: ${status}`);
          }

          const defaultDatasetId = runResponse.data.data.defaultDatasetId;
          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  pageUrl,
                  status: "Success",
                  pagesFound: datasetResponse.data.length,
                  data: datasetResponse.data
                }, null, 2),
              },
            ],
          };
        } catch (apifyErr) {
          throw new Error(`Failed to execute Apify Facebook scraper: ${apifyErr.message}`);
        }
      }

      case "scrape_google_maps_reviews": {
        const placeUrl = args.placeUrl;
        const maxReviews = args.maxReviews || 50;
        const APIFY_TOKEN = process.env.APIFY_TOKEN;

        if (!APIFY_TOKEN) {
          throw new Error("Missing APIFY_TOKEN in environment. Required to run kaix/google-maps-reviews-scraper.");
        }

        try {
          const runResponse = await axios.post(
            `https://api.apify.com/v2/acts/kaix~google-maps-reviews-scraper/runs?token=${APIFY_TOKEN}`,
            {
              startUrls: [{ url: placeUrl }],
              maxReviews,
            }
          );

          const run = runResponse.data?.data;
          const runId = run?.id;
          const defaultDatasetId = run?.defaultDatasetId;
          if (!runId || !defaultDatasetId) {
            throw new Error("Apify returned an invalid Google Maps scraper run.");
          }

          let status = run.status || "RUNNING";
          while (status === "RUNNING" || status === "READY") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const checkResponse = await axios.get(
              `https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_TOKEN}`
            );
            status = checkResponse.data?.data?.status;
          }

          if (status !== "SUCCEEDED") {
            throw new Error(`Apify run finished with status: ${status || "UNKNOWN"}`);
          }

          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`
          );
          const reviews = Array.isArray(datasetResponse.data) ? datasetResponse.data : [];

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  placeUrl,
                  status: "Success",
                  reviewsFound: reviews.length,
                  data: reviews,
                }, null, 2),
              },
            ],
          };
        } catch (apifyErr) {
          throw new Error(`Failed to execute Apify Google Maps reviews scraper: ${apifyErr.message}`);
        }
      }

      case "scrape_makemytrip": {
        const hotelUrl = args.hotelUrl;
        const maxReviews = args.maxReviews || 20;
        const APIFY_TOKEN = process.env.APIFY_TOKEN;

        if (!APIFY_TOKEN) {
          throw new Error("Missing APIFY_TOKEN in environment. Required to run krazee_kaushik/makemytrip-hotel-reviews-scraper.");
        }

        try {
          // Trigger the Apify Actor
          const runResponse = await axios.post(
            `https://api.apify.com/v2/acts/krazee_kaushik~makemytrip-hotel-reviews-scraper/runs?token=${APIFY_TOKEN}`,
            {
              startUrls: [{ url: hotelUrl }],
              maxItems: maxReviews
            }
          );
          
          const runId = runResponse.data.data.id;
          
          // Wait for the run to finish
          let status = "RUNNING";
          while (status === "RUNNING" || status === "READY") {
            // Wait a few seconds between polls
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const checkResponse = await axios.get(
              `https://api.apify.com/v2/acts/krazee_kaushik~makemytrip-hotel-reviews-scraper/runs/${runId}?token=${APIFY_TOKEN}`
            );
            status = checkResponse.data.data.status;
          }

          if (status !== "SUCCEEDED") {
            throw new Error(`Apify run finished with status: ${status}`);
          }

          // Fetch results from default dataset
          const defaultDatasetId = runResponse.data.data.defaultDatasetId;
          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  hotelUrl,
                  status: "Success",
                  reviewsFound: datasetResponse.data.length,
                  data: datasetResponse.data
                }, null, 2),
              },
            ],
          };
        } catch (apifyErr) {
          throw new Error(`Failed to execute Apify MakeMyTrip scraper: ${apifyErr.message}`);
        }
      }

      case "scrape_makemytrip_hotels": {
        const searchUrl = args.searchUrl;
        const maxItems = args.maxItems || 20;
        const APIFY_TOKEN = process.env.APIFY_TOKEN;

        if (!APIFY_TOKEN) {
          throw new Error("Missing APIFY_TOKEN in environment. Required to run krazee_kaushik/makemytrip-hotels-scraper.");
        }

        try {
          const runResponse = await axios.post(
            `https://api.apify.com/v2/acts/krazee_kaushik~makemytrip-hotels-scraper/runs?token=${APIFY_TOKEN}`,
            {
              startUrls: [{ url: searchUrl }],
              maxItems: maxItems
            }
          );
          
          const runId = runResponse.data.data.id;
          
          let status = "RUNNING";
          while (status === "RUNNING" || status === "READY") {
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const checkResponse = await axios.get(
              `https://api.apify.com/v2/acts/krazee_kaushik~makemytrip-hotels-scraper/runs/${runId}?token=${APIFY_TOKEN}`
            );
            status = checkResponse.data.data.status;
          }

          if (status !== "SUCCEEDED") {
            throw new Error(`Apify run finished with status: ${status}`);
          }

          const defaultDatasetId = runResponse.data.data.defaultDatasetId;
          const datasetResponse = await axios.get(
            `https://api.apify.com/v2/datasets/${defaultDatasetId}/items?token=${APIFY_TOKEN}`
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  searchUrl,
                  status: "Success",
                  hotelsFound: datasetResponse.data.length,
                  data: datasetResponse.data
                }, null, 2),
              },
            ],
          };
        } catch (apifyErr) {
          throw new Error(`Failed to execute Apify MakeMyTrip Hotels scraper: ${apifyErr.message}`);
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Social & Travel Scraper MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in MCP server:", error);
  process.exit(1);
});
