/**
 * Sales Engine Lead Categories
 *
 * Central backend definition of the supported lead categories.
 *
 * This file does not perform API calls, AI evaluation,
 * scoring, scraping, or persistence.
 *
 * It only defines the valid category structure.
 */

const LEAD_CATEGORIES = {
    CHANNEL_PARTNER: {
        id: "channel_partner",
        name: "Channel Partner",
        subCategories: {
            HOTEL_CONSULTANT: {
                id: "hotel_consultant",
                name: "Hotel Consultant",
            },

            WEDDING_EVENT_MANAGER: {
                id: "wedding_event_manager",
                name: "Wedding / Event Manager",
            },

            FB_CONSULTANT: {
                id: "fb_consultant",
                name: "F&B Consultant",
            },

            FB_SUPPLIER: {
                id: "fb_supplier",
                name: "F&B Supplier",
            },

            TRAINING_INSTITUTE: {
                id: "training_institute",
                name: "Training Institute",
            },
        },
    },

    DIRECT_CUSTOMER: {
        id: "direct_customer",
        name: "Direct Customer",
        subCategories: {
            HOTEL: {
                id: "hotel",
                name: "Hotel",
            },

            RESORT: {
                id: "resort",
                name: "Resort",
            },

            SPA: {
                id: "spa",
                name: "Spa",
            },

            RESTAURANT: {
                id: "restaurant",
                name: "Restaurant",
            },

            SERVICE_APARTMENT: {
                id: "service_apartment",
                name: "Service Apartment",
            },
        },
    },
};

/**
 * Flat list of all supported sub-categories.
 */
const ALL_LEAD_SUBCATEGORIES = [
    ...Object.values(LEAD_CATEGORIES.CHANNEL_PARTNER.subCategories),
    ...Object.values(LEAD_CATEGORIES.DIRECT_CUSTOMER.subCategories),
];

/**
 * Check whether a main category is valid.
 */
function isValidLeadCategory(category) {
    return Object.values(LEAD_CATEGORIES).some(
        (item) => item.id === category
    );
}

/**
 * Check whether a sub-category is valid.
 */
function isValidLeadSubCategory(subCategory) {
    return ALL_LEAD_SUBCATEGORIES.some(
        (item) => item.id === subCategory
    );
}

/**
 * Find the parent category for a sub-category.
 */
function getCategoryForSubCategory(subCategory) {
    for (const category of Object.values(LEAD_CATEGORIES)) {
        const found = Object.values(category.subCategories).find(
            (item) => item.id === subCategory
        );

        if (found) {
            return category.id;
        }
    }

    return null;
}

module.exports = {
    LEAD_CATEGORIES,
    isValidLeadCategory,
    isValidLeadSubCategory,
    getCategoryForSubCategory,
};