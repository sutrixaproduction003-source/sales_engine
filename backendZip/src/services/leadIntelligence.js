/**
 * Sales Engine — Lead Intelligence
 *
 * Converts lead classification/context into sales-oriented signals.
 * This is intentionally rule-based for now so the system remains fast,
 * deterministic, and easy to replace with an AI model later.
 */

const HOT_THRESHOLD = 75;
const WARM_THRESHOLD = 50;

/**
 * Safely convert a value to lowercase text.
 */
function text(value) {
    return String(value || "").trim().toLowerCase();
}

/**
 * Calculate sales signals from the normalized lead.
 */
function detectLeadSignals(lead) {
    const companyName = text(lead.companyName);
    const jobTitle = text(lead.jobTitle);
    const industry = text(lead.industry);
    const location = text(lead.location);
    const subCategory = text(lead.subCategory);
    const category = text(lead.category);

    const signals = [];
    const positiveSignals = [];
    const negativeSignals = [];

    // ---------------------------------------------------------
    // Hospitality / business-type signals
    // ---------------------------------------------------------

    if (
        ["hotel", "resort", "spa", "restaurant", "service_apartment"].includes(
            subCategory
        )
    ) {
        positiveSignals.push("Direct hospitality customer");
    }

    if (category === "channel_partner") {
        positiveSignals.push("Potential channel partner");
    }

    if (
        industry.includes("hospitality") ||
        industry.includes("hotel") ||
        industry.includes("restaurant") ||
        industry.includes("travel")
    ) {
        positiveSignals.push("Hospitality-related industry");
    }

    // ---------------------------------------------------------
    // Job-title signals
    // ---------------------------------------------------------

    const decisionMakerTitles = [
        "owner",
        "founder",
        "co-founder",
        "director",
        "general manager",
        "managing director",
        "ceo",
        "chief executive",
        "partner",
    ];

    if (decisionMakerTitles.some((title) => jobTitle.includes(title))) {
        positiveSignals.push("Likely decision maker");
    }

    const managementTitles = [
        "manager",
        "operations",
        "commercial",
        "sales",
        "revenue",
        "marketing",
        "business development",
    ];

    if (managementTitles.some((title) => jobTitle.includes(title))) {
        positiveSignals.push("Management or commercial role");
    }

    // ---------------------------------------------------------
    // Contactability signals
    // ---------------------------------------------------------

    if (lead.email) {
        positiveSignals.push("Email available");
    }

    if (lead.phone) {
        positiveSignals.push("Phone available");
    }

    if (lead.linkedinUrl) {
        positiveSignals.push("LinkedIn profile available");
    }

    if (lead.companyWebsite) {
        positiveSignals.push("Company website available");
    }

    // ---------------------------------------------------------
    // Category-specific signals
    // ---------------------------------------------------------

    if (subCategory === "hotel" || subCategory === "resort") {
        signals.push("Property operations opportunity");
    }

    if (subCategory === "restaurant") {
        signals.push("Restaurant operations opportunity");
    }

    if (subCategory === "service_apartment") {
        signals.push("Accommodation automation opportunity");
    }

    if (subCategory === "spa") {
        signals.push("Wellness operations opportunity");
    }

    if (subCategory === "hotel_consultant") {
        signals.push("Potential hotel network influence");
    }

    if (subCategory === "wedding_event_manager") {
        signals.push("Potential venue and hotel influence");
    }

    if (subCategory === "fb_consultant" || subCategory === "fb_supplier") {
        signals.push("Potential F&B network influence");
    }

    if (subCategory === "training_institute") {
        signals.push("Potential hospitality workforce influence");
    }

    // ---------------------------------------------------------
    // Context signals
    // ---------------------------------------------------------

    if (companyName) {
        positiveSignals.push("Company identified");
    }

    if (location) {
        positiveSignals.push("Location identified");
    }

    // ---------------------------------------------------------
    // Combine signals
    // ---------------------------------------------------------

    const allSignals = [...signals, ...positiveSignals];

    return {
        signals: allSignals,
        positiveSignals,
        negativeSignals,
    };
}

/**
 * Calculate a simple 0–100 sales priority score.
 */
function calculatePriorityScore(lead, signalData) {
    let score = 0;

    const subCategory = text(lead.subCategory);
    const jobTitle = text(lead.jobTitle);

    // Strong category relevance
    if (
        [
            "hotel",
            "resort",
            "spa",
            "restaurant",
            "service_apartment",
        ].includes(subCategory)
    ) {
        score += 30;
    }

    if (text(lead.category) === "channel_partner") {
        score += 25;
    }

    // Decision-maker relevance
    if (
        [
            "owner",
            "founder",
            "co-founder",
            "ceo",
            "director",
            "general manager",
            "managing director",
            "partner",
        ].some((title) => jobTitle.includes(title))
    ) {
        score += 20;
    } else if (
        ["manager", "operations", "sales", "revenue", "marketing"].some((title) =>
            jobTitle.includes(title)
        )
    ) {
        score += 10;
    }

    // Contactability
    if (lead.email) score += 10;
    if (lead.phone) score += 5;
    if (lead.linkedinUrl) score += 5;
    if (lead.companyWebsite) score += 5;

    // Classification confidence
    if (typeof lead.classificationConfidence === "number") {
        score += Math.round(lead.classificationConfidence * 10);
    }

    // Keep score within 0–100
    return Math.min(100, Math.max(0, score));
}

/**
 * Convert numeric score into sales priority.
 */
function getPriority(score) {
    if (score >= HOT_THRESHOLD) {
        return "HOT";
    }

    if (score >= WARM_THRESHOLD) {
        return "WARM";
    }

    return "COLD";
}

/**
 * Recommend the next sales action.
 */
function getRecommendedAction(lead, priority) {
    const subCategory = text(lead.subCategory);
    const category = text(lead.category);

    if (priority === "HOT") {
        if (category === "channel_partner") {
            return "Contact partner for collaboration discussion";
        }

        return "Contact decision maker directly";
    }

    if (priority === "WARM") {
        if (category === "channel_partner") {
            return "Research partner network and start outreach";
        }

        return "Research account and prepare personalized outreach";
    }

    if (subCategory === "restaurant") {
        return "Collect more restaurant context before outreach";
    }

    return "Continue lead research";
}

/**
 * Generate the complete intelligence object.
 */
function analyzeLead(lead) {
    const signalData = detectLeadSignals(lead);

    const priorityScore = calculatePriorityScore(lead, signalData);

    const priority = getPriority(priorityScore);

    const recommendedAction = getRecommendedAction(lead, priority);

    return {
        signals: signalData.signals,
        positiveSignals: signalData.positiveSignals,
        negativeSignals: signalData.negativeSignals,
        priorityScore,
        priority,
        recommendedAction,
        aiEvaluatedAt: new Date().toISOString(),
    };
}

module.exports = {
    detectLeadSignals,
    calculatePriorityScore,
    getPriority,
    getRecommendedAction,
    analyzeLead,
};