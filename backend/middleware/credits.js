const { getOrCreateUser, deductCredits } = require('../db/database');

// Credit costs per AI model tier
const CREDIT_COSTS = {
    lite: 1,   // triage, thread assignment, scoring, rule generation
    mid: 3,    // memory extraction, briefing, chat respond
    pro: 5,    // summary generation, reply drafting
};

/**
 * Middleware: identify the current user from signed cookie.
 * Attaches req.userEmail and req.userRecord to the request.
 */
async function identifyUser(req, res, next) {
    const email = req.signedCookies?.user_email;
    if (email) {
        req.userEmail = email;
        req.userRecord = await getOrCreateUser(email);
    }
    next();
}

/**
 * Track credit usage after a successful AI call.
 * Safe to call even if no user is identified (no-op).
 * @param {string} email - User email
 * @param {number} cost - Credits to deduct
 * @param {'lite'|'mid'|'pro'} tier - Which model tier was used
 */
async function deductUserCredits(email, cost, tier = 'lite') {
    if (!email || cost <= 0) return;
    await deductCredits(email, cost, tier);
}

module.exports = {
    CREDIT_COSTS,
    identifyUser,
    deductUserCredits,
};
