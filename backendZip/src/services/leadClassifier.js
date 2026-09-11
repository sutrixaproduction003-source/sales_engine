/**
 * Sales Engine Lead Classifier
 *
 * Classifies discovered leads into the Sales Engine's
 * channel-partner and direct-customer categories.
 *
 * This is the deterministic classification layer.
 * AI-based intelligence/scoring will be added later.
 */

const {
    isValidLeadCategory,
    isValidLeadSubCategory,
    getCategoryForSubCategory,
} = require('../config/leadCategories');

function normalizeText(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function compactText(value) {
    return normalizeText(value).replace(/[^a-z0-9]+/g, ' ');
}

function containsAny(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}

function createResult(subCategory, confidence, reason) {
    if (!isValidLeadSubCategory(subCategory)) {
        return {
            category: null,
            subCategory: null,
            classificationConfidence: null,
            classificationReason: null,
        };
    }

    const category = getCategoryForSubCategory(subCategory);

    if (!isValidLeadCategory(category)) {
        return {
            category: null,
            subCategory: null,
            classificationConfidence: null,
            classificationReason: null,
        };
    }

    return {
        category,
        subCategory,
        classificationConfidence: confidence,
        classificationReason: reason,
    };
}

/**
 * Classify a lead using available business/person information.
 *
 * Priority:
 * 1. Strong job-title/business signals
 * 2. Company/business signals
 * 3. Industry signals
 * 4. Unknown when evidence is insufficient
 */
function classifyLead(lead = {}) {
    const jobTitle = normalizeText(
        lead.jobTitle ??
        lead.job_title ??
        lead.title
    );

    const companyName = normalizeText(
        lead.companyName ??
        lead.company_name ??
        lead.organization?.name
    );

    const industry = normalizeText(
        lead.industry ??
        lead.organization?.industry
    );

    const companyWebsite = normalizeText(
        lead.companyWebsite ??
        lead.company_website ??
        lead.website ??
        lead.organization?.domain
    );

    const fullText = [
        jobTitle,
        companyName,
        industry,
        companyWebsite,
    ]
        .filter(Boolean)
        .join(' ');
    const compactFullText = compactText(fullText);

    /*
     * ---------------------------------------------------------
     * CHANNEL PARTNERS
     * ---------------------------------------------------------
     */

    // Hotel Consultant
    if (
        containsAny(jobTitle, [
            'hotel consultant',
            'hospitality consultant',
            'hospitality advisor',
            'hotel advisory',
            'hospitality advisory',
            'hotel consulting',
            'hospitality consulting',
        ]) ||
        containsAny(companyName, [
            'hotel consultant',
            'hospitality consultant',
            'hospitality advisory',
            'hotel advisory',
            'hospitality consulting',
        ])
    ) {
        return createResult(
            'hotel_consultant',
            0.96,
            'Strong hotel or hospitality consulting signal.'
        );
    }

    // Wedding / Event Manager
    if (
        containsAny(jobTitle, [
            'wedding planner',
            'wedding manager',
            'event manager',
            'event planner',
            'event coordinator',
            'wedding coordinator',
            'destination wedding',
            'wedding consultant',
        ]) ||
        containsAny(companyName, [
            'wedding planner',
            'wedding events',
            'event management',
            'event planner',
            'wedding',
        ])
    ) {
        return createResult(
            'wedding_event_manager',
            0.95,
            'Strong wedding or event-management signal.'
        );
    }

    // F&B Consultant
    if (
        containsAny(jobTitle, [
            'f&b consultant',
            'f&b consultant',
            'food and beverage consultant',
            'food beverage consultant',
            'restaurant consultant',
            'restaurant consulting',
            'f&b advisory',
            'food service consultant',
            'hospitality f&b consultant',
        ]) ||
        containsAny(companyName, [
            'f&b consultant',
            'food and beverage consultant',
            'restaurant consultant',
            'restaurant consulting',
        ])
    ) {
        return createResult(
            'fb_consultant',
            0.95,
            'Strong food and beverage consulting signal.'
        );
    }

    // F&B Supplier
    if (
        containsAny(jobTitle, [
            'food supplier',
            'beverage supplier',
            'f&b supplier',
            'food distributor',
            'beverage distributor',
            'hospitality supplier',
            'restaurant supplier',
            'kitchen equipment supplier',
        ]) ||
        containsAny(companyName, [
            'food supplier',
            'beverage supplier',
            'food distributor',
            'beverage distributor',
            'hospitality supplier',
            'restaurant supplier',
            'kitchen equipment',
        ]) ||
        containsAny(industry, [
            'food distribution',
            'food wholesale',
            'beverage distribution',
            'food service',
        ])
    ) {
        return createResult(
            'fb_supplier',
            0.93,
            'Strong food, beverage or hospitality supplier signal.'
        );
    }

    // Training Institute
    if (
        containsAny(jobTitle, [
            'training institute',
            'training manager',
            'hospitality trainer',
            'hospitality training',
            'hospitality educator',
            'faculty hospitality',
            'hospitality professor',
            'placement officer',
        ]) ||
        containsAny(companyName, [
            'hotel management institute',
            'hospitality institute',
            'hospitality academy',
            'hotel management college',
            'hospitality school',
            'hotel school',
            'training institute',
        ]) ||
        containsAny(industry, [
            'education',
            'hospitality education',
            'training',
        ])
    ) {
        return createResult(
            'training_institute',
            0.90,
            'Hospitality training or education signal detected.'
        );
    }

    /*
     * ---------------------------------------------------------
     * DIRECT CUSTOMERS
     * ---------------------------------------------------------
     */

    // Service Apartment
    if (
        containsAny(compactFullText, [
            'service apartment',
            'serviced apartment',
            'serviced apartments',
            'extended stay',
            'extended-stay',
            'aparthotel',
        ])
    ) {
        return createResult(
            'service_apartment',
            0.96,
            'Strong serviced-apartment or extended-stay property signal.'
        );
    }

    // Spa
    if (
        containsAny(jobTitle, [
            'spa manager',
            'spa director',
            'spa owner',
            'wellness manager',
            'wellness director',
            'wellness owner',
        ]) ||
        containsAny(companyName, [
            'spa',
            'wellness',
            'ayurveda',
            'wellness resort',
        ]) ||
        containsAny(industry, [
            'spa',
            'wellness',
            'health wellness',
        ])
    ) {
        return createResult(
            'spa',
            0.92,
            'Strong spa or wellness business signal.'
        );
    }

    // Restaurant
    if (
        containsAny(jobTitle, [
            'restaurant manager',
            'restaurant director',
            'restaurant owner',
            'restaurant general manager',
            'food and beverage manager',
            'f&b manager',
            'f&b director',
            'restaurant operations',
            'restaurant operations manager',
            'outlet manager',
            'cafe manager',
            'cafe owner',
            'bar manager',
        ]) ||
        containsAny(companyName, [
            'restaurant',
            'restaurants',
            'cafe',
            'coffee house',
            'bistro',
            'dining',
            'qsr',
        ]) ||
        containsAny(industry, [
            'restaurants',
            'food & beverages',
            'food and beverages',
            'food service',
        ])
    ) {
        return createResult(
            'restaurant',
            0.93,
            'Strong restaurant or food-service business signal.'
        );
    }

    // Resort
    if (
        containsAny(jobTitle, [
            'resort manager',
            'resort director',
            'resort general manager',
            'resort owner',
            'resort operations',
        ]) ||
        containsAny(companyName, [
            'resort',
            'resorts',
        ]) ||
        containsAny(industry, [
            'resorts',
            'resort',
            'hospitality resort',
        ])
    ) {
        return createResult(
            'resort',
            0.94,
            'Strong resort property signal.'
        );
    }

    // Hotel
    if (
        containsAny(jobTitle, [
            'hotel manager',
            'hotel director',
            'hotel general manager',
            'hotel owner',
            'hotel operations',
            'hotel operations manager',
            'rooms division manager',
            'front office manager',
            'front office director',
            'hotel revenue manager',
            'revenue manager',
            'hotel sales manager',
            'hotel director of sales',
            'director of rooms',
        ]) ||
        containsAny(companyName, [
            'hotel',
            'hotels',
            'inn',
            'lodge',
            'boutique hotel',
            'heritage hotel',
        ]) ||
        containsAny(industry, [
            'hospitality',
            'hotels',
            'hotel',
            'lodging',
            'accommodation',
            'travel accommodation',
        ])
    ) {
        return createResult(
            'hotel',
            0.91,
            'Strong hotel or hospitality-property signal.'
        );
    }

    /*
     * ---------------------------------------------------------
     * UNKNOWN
     * ---------------------------------------------------------
     */

    return {
        category: null,
        subCategory: null,
        classificationConfidence: null,
        classificationReason: null,
    };
}

module.exports = {
    classifyLead,
};