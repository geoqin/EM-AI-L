/**
 * Normalize a string: lowercase, replace separators with spaces.
 */
const normalize = (s) => (s || '').toLowerCase().replace(/[.\-_@+]/g, ' ');

/**
 * Fuzzy search: tokenizes query and matches each token independently.
 * Treats spaces, dots, hyphens, and underscores as equivalent separators.
 * All tokens must appear somewhere in at least one of the target fields.
 *
 * @param {string} query - The search query
 * @param {...string} fields - The fields to search against
 * @returns {boolean} true if all query tokens match
 */
export function fuzzyMatch(query, ...fields) {
    if (!query) return true;

    const normalizedFields = fields.map(normalize);
    const rawFields = fields.map(f => (f || '').toLowerCase());

    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;

    return tokens.every(token =>
        normalizedFields.some(field => field.includes(token))
        || rawFields.some(field => field.includes(token))
    );
}

/**
 * Weighted field definitions for relevance scoring.
 * Higher weight = stronger signal that this email is what the user wants.
 */
const FIELD_WEIGHTS = {
    from_email: 10,
    subject: 7,
    snippet: 4,
    body: 1,
};

const TRIAGE_MULTIPLIERS = {
    regular: 1.5,
    unprocessed: 1.2,
    for_review: 1.0,
    junk: 0.3,
    spam: 0.3,
    confirmed_junk: 0.1,
};

/**
 * Score an email against a search query for relevance ranking.
 * Returns 0 if the email doesn't match at all.
 *
 * @param {string} query - The search query
 * @param {object} email - Email object with from_email, subject, snippet, body, triage_category
 * @returns {number} Relevance score (0 = no match, higher = more relevant)
 */
export function scoreEmail(query, email) {
    if (!query) return 1;

    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return 1;

    // Check each weighted field for token matches
    let totalScore = 0;

    for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
        const value = email[field];
        if (!value) continue;

        const normalizedValue = normalize(value);
        const rawValue = value.toLowerCase();

        let fieldHits = 0;
        for (const token of tokens) {
            if (normalizedValue.includes(token) || rawValue.includes(token)) {
                fieldHits++;
            }
        }

        if (fieldHits > 0) {
            // Proportion of tokens matched in this field * weight
            totalScore += (fieldHits / tokens.length) * weight;
        }
    }

    // No matches anywhere = filter out
    if (totalScore === 0) return 0;

    // Apply triage category multiplier
    const triageMultiplier = TRIAGE_MULTIPLIERS[email.triage_category] ?? 1.0;

    return totalScore * triageMultiplier;
}
