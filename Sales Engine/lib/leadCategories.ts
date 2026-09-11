/**
 * Lead Categories
 *
 * Central definition of the Sales Engine lead classification structure.
 *
 * IMPORTANT:
 * - This file only defines the category structure.
 * - It does not change existing provider/search functionality.
 * - It does not contain mock leads.
 * - It does not perform AI scoring.
 * - It does not perform API calls.
 *
 * The backend can later use the same category values for:
 * classification, scoring, priority and sales actions.
 */

export type LeadCategoryType = "channel_partner" | "direct_customer";

export type LeadSubCategory =
    // Channel Partners
    | "hotel_consultant"
    | "wedding_event_manager"
    | "fb_consultant"
    | "fb_supplier"
    | "training_institute"

    // Direct Customers
    | "hotel"
    | "resort"
    | "spa"
    | "restaurant"
    | "service_apartment";

export interface LeadCategory {
    id: LeadSubCategory;
    name: string;
    category: LeadCategoryType;
    description: string;
}

/**
 * Main Sales Engine lead categories.
 *
 * Channel Partners:
 * Businesses/professionals who can influence or connect
 * Sutrixa OS with hotels and hospitality businesses.
 *
 * Direct Customers:
 * Businesses that can directly use Sutrixa OS.
 */
export const LEAD_CATEGORIES: LeadCategory[] = [
    // ============================================================
    // CHANNEL PARTNERS
    // ============================================================

    {
        id: "hotel_consultant",
        name: "Hotel Consultant",
        category: "channel_partner",
        description:
            "Hospitality consultants who advise hotels, resorts or hospitality businesses.",
    },

    {
        id: "wedding_event_manager",
        name: "Wedding / Event Manager",
        category: "channel_partner",
        description:
            "Wedding and event professionals who manage events and work with hotels, resorts or venues.",
    },

    {
        id: "fb_consultant",
        name: "F&B Consultant",
        category: "channel_partner",
        description:
            "Food and beverage consultants providing menu, kitchen, operations or F&B advisory services.",
    },

    {
        id: "fb_supplier",
        name: "F&B Supplier",
        category: "channel_partner",
        description:
            "Suppliers providing food, beverage, kitchen, equipment or related hospitality products and services.",
    },

    {
        id: "training_institute",
        name: "Training Institute",
        category: "channel_partner",
        description:
            "Hospitality and training institutes connected with hospitality workforce development and hotel placements.",
    },

    // ============================================================
    // DIRECT CUSTOMERS
    // ============================================================

    {
        id: "hotel",
        name: "Hotel",
        category: "direct_customer",
        description:
            "Hotels that can directly use Sutrixa OS for hospitality operations and management.",
    },

    {
        id: "resort",
        name: "Resort",
        category: "direct_customer",
        description:
            "Resorts that can directly use Sutrixa OS for property and operational management.",
    },

    {
        id: "spa",
        name: "Spa",
        category: "direct_customer",
        description:
            "Spas and wellness properties that may require operational and customer management systems.",
    },

    {
        id: "restaurant",
        name: "Restaurant",
        category: "direct_customer",
        description:
            "Restaurants including fine dining, QSRs, cafes and hotel-based restaurants.",
    },

    {
        id: "service_apartment",
        name: "Service Apartment",
        category: "direct_customer",
        description:
            "Serviced apartments and extended-stay properties that can use Sutrixa OS for operational automation.",
    },
];

/**
 * Channel Partner categories.
 */
export const CHANNEL_PARTNER_CATEGORIES = LEAD_CATEGORIES.filter(
    (item) => item.category === "channel_partner"
);

/**
 * Direct Customer categories.
 */
export const DIRECT_CUSTOMER_CATEGORIES = LEAD_CATEGORIES.filter(
    (item) => item.category === "direct_customer"
);

/**
 * Find a category by its ID.
 */
export function getLeadCategory(
    id: LeadSubCategory
): LeadCategory | undefined {
    return LEAD_CATEGORIES.find((item) => item.id === id);
}

/**
 * Get all categories belonging to a main category.
 */
export function getLeadCategoriesByType(
    category: LeadCategoryType
): LeadCategory[] {
    return LEAD_CATEGORIES.filter((item) => item.category === category);
}

/**
 * Convert the internal category value into a user-friendly label.
 */
export function getLeadCategoryLabel(
    id: LeadSubCategory
): string {
    return getLeadCategory(id)?.name ?? id;
}

/**
 * Convert the internal main category value into a user-friendly label.
 */
export function getLeadCategoryTypeLabel(
    category: LeadCategoryType
): string {
    return category === "channel_partner"
        ? "Channel Partner"
        : "Direct Customer";
}