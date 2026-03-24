const express = require('express');
const router = express.Router();
const { getTokens, getOutlookTokens, saveOutlookTokens, getThreads, getThreadWithEmails, getEmailsByCategory, getEmailsByCategoryCount,
    updateTriageResult, markActionTaken, getPendingActions, getAllSettings, setSetting,
    getEmailById, getSetting, addTriageRule, getTriageRules, deleteTriageRule, updateTriageRuleDef,
    approveSuggestedRule, getFilterCountBySender, getUnthreadedEmails, getAllRegularEmails,
    assignEmailToThread, createThread, removeEmailFromThread,
    deleteThread: deleteThreadDb, bulkUpdateTriageCategories, query, updateThreadMemory } = require('../db/database');
const { triageNewEmails, threadConfirmedEmails } = require('../services/thread-processor');
const gmail = require('../services/gmail');
const outlook = require('../services/outlook');
const ai = require('../services/ai');
const { deductUserCredits, CREDIT_COSTS } = require('../middleware/credits');

/**
 * Middleware: ensure user is authenticated (at least one provider)
 */
async function requireAuth(req, res, next) {
    const tokens = await getTokens();
    const outlookTokens = await getOutlookTokens();
    if (!tokens && !outlookTokens) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    req.tokens = tokens;
    req.outlookTokens = outlookTokens;
    next();
}

/**
 * GET /api/threads
 * List all semantic threads with summaries
 */
router.get('/', requireAuth, async (req, res) => {
    const threads = await getThreads();
    res.json({ threads });
});

/**
 * GET /api/threads/process-stream
 * SSE endpoint — streams real-time progress from the processing pipeline.
 * Must be defined BEFORE /:id to avoid being caught by the param route.
 */
router.get('/process-stream', requireAuth, async (req, res) => {
    // Set up SSE headers (use setHeader to preserve CORS headers from middleware)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
        // Triage only — threading happens after user confirms
        const stats = await triageNewEmails((message) => {
            sendEvent({ type: 'progress', message });
        });
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        sendEvent({
            type: 'done',
            message: `Triaged ${stats.triaged} emails: ${stats.regular} regular, ${stats.junk} junk, ${stats.spam} spam, ${stats.forReview} for review.`,
            stats,
        });
    } catch (error) {
        console.error('❌ Processing error:', error.message);
        sendEvent({ type: 'error', message: error.message });
    }

    res.end();
});

/**
 * GET /api/threads/:id
 * Thread detail with emails, summary, and memory
 */
router.get('/:id', requireAuth, async (req, res) => {
    const thread = await getThreadWithEmails(parseInt(req.params.id));
    if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
    }
    res.json({ thread });
});

/**
 * POST /api/threads/process
 * Trigger AI processing pipeline (triage + thread + summarize)
 */
router.post('/process', requireAuth, async (req, res) => {
    try {
        // Triage only — threading happens after user confirms
        const stats = await triageNewEmails();
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        res.json({
            message: `Triaged ${stats.triaged} emails: ${stats.regular} regular, ${stats.junk} junk, ${stats.spam} spam, ${stats.forReview} for review.`,
            stats,
        });
    } catch (error) {
        console.error('❌ Processing error:', error.message);
        res.status(500).json({ error: 'Processing failed: ' + error.message });
    }
});


/**
 * GET /api/threads/emails/:category
 * Get emails by triage category (junk, spam, important)
 */
router.get('/emails/:category', requireAuth, async (req, res) => {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const emails = await getEmailsByCategory(category, { limit, offset });
    const total = await getEmailsByCategoryCount(category);

    res.json({ emails, total });
});

/**
 * POST /api/threads/emails/:id/generate-rule
 * AI generates a smart triage rule from user reasoning
 */
router.post('/emails/:id/generate-rule', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const { category, reasoning } = req.body;

        const email = await getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const existingRules = await getTriageRules();
        const proposedRules = await ai.generateTriageRule(email, category, reasoning, existingRules);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        console.log(`🤖 AI proposed ${proposedRules.length} rules.`);
        res.json({ rules: proposedRules });
    } catch (error) {
        console.error('❌ Rule generation error:', error.message);
        res.status(500).json({ error: 'Failed to generate rule: ' + error.message });
    }
});

/**
 * PATCH /api/threads/emails/:id/triage
 * Override triage classification for an email.
 * If rules are provided (user approved AI-generated rules), save them.
 * Otherwise, just reclassify and check for patterns to suggest rules.
 */
router.patch('/emails/:id/triage', requireAuth, async (req, res) => {
    const emailId = parseInt(req.params.id);
    const { category, rules } = req.body;

    if (!['regular', 'junk', 'spam', 'for_review', 'confirmed_junk', 'unprocessed'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }

    const email = await getEmailById(emailId);
    if (!email) return res.status(404).json({ error: 'Email not found' });

    let primaryReason = 'Manual override by user';

    // Save explicitly provided rules (from Teach AI flow)
    if (rules && Array.isArray(rules) && rules.length > 0) {
        for (const rule of rules) {
            if (rule.id) {
                // Update existing rule
                await updateTriageRuleDef(rule.id, {
                    sender_pattern: rule.sender_pattern,
                    subject_pattern: rule.subject_pattern || null,
                    category: rule.category || category,
                    reason: rule.reason,
                });
                console.log(`📚 Updated rule #${rule.id}: "${rule.reason}"`);
            } else if (rule.sender_pattern) {
                // Add new rule
                await addTriageRule({
                    sender_pattern: rule.sender_pattern,
                    subject_pattern: rule.subject_pattern || null,
                    category: rule.category || category,
                    reason: rule.reason,
                });
                console.log(`📚 Saved new rule: "${rule.reason}"`);
            }
            if (!rule.id) primaryReason = rule.reason; // Use the new rule's reason for the email
        }
        await updateTriageResult(emailId, category, primaryReason);
        return res.json({ message: `Email moved to ${category}. Rules applied.` });
    }

    await updateTriageResult(emailId, category, primaryReason);

    // Pattern detection: if filtering, check if this sender is being repeatedly filtered
    if (category === 'junk' || category === 'spam' || category === 'confirmed_junk') {
        const senderDomain = (email.from_email || '').match(/@([^>\s]+)/)?.[1] || '';
        if (senderDomain) {
            const filterCount = await getFilterCountBySender(senderDomain);
            // After 2+ manual filters from same sender, suggest a rule
            if (filterCount >= 1) { // This is the 2nd+ time (current override already counted)
                try {
                    const existingRules = await getTriageRules();
                    const alreadySuggested = existingRules.some(r =>
                        r.sender_pattern === senderDomain && (r.status === 'suggested' || r.status === 'active'));
                    if (!alreadySuggested) {
                        const proposedRules = await ai.generateTriageRule(email, category,
                            `User has manually filtered ${filterCount + 1} emails from ${senderDomain}`, existingRules);

                        for (const suggestedRule of proposedRules) {
                            if (suggestedRule.id) {
                                continue;
                            }
                            await addTriageRule({
                                sender_pattern: suggestedRule.sender_pattern || senderDomain,
                                subject_pattern: suggestedRule.subject_pattern || null,
                                category: suggestedRule.category || category,
                                reason: suggestedRule.reason || `Emails from ${senderDomain}`,
                                status: 'suggested',
                            });
                            console.log(`💡 Suggested rule: "${suggestedRule.reason}" for ${senderDomain}`);
                        }
                    }
                } catch (err) {
                    console.error('⚠️ Failed to generate suggested rule:', err.message);
                    // Non-fatal — don't block the reclassification
                }
            }
        }
    }

    console.log(`↔️ Moved "${email.subject}" → ${category}`);
    res.json({ message: `Email moved to ${category}.` });
});

/**
 * POST /api/threads/emails/:id/apply-action
 * Apply the configured action for a junk/spam email in Gmail
 */
router.post('/emails/:id/apply-action', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const email = await getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const action = await getSetting('junk_action') || 'move_to_junk';
        const gmailClient = gmail.getGmailClient({
            access_token: req.tokens.access_token,
            refresh_token: req.tokens.refresh_token,
        });

        const result = await gmail.applyGmailAction(gmailClient, email.gmail_id, action);
        await markActionTaken(emailId);

        console.log(`📬 ${result}: "${email.subject}"`);
        res.json({ message: result });
    } catch (error) {
        console.error('❌ Action error:', error.message);
        res.status(500).json({ error: 'Failed to apply action: ' + error.message });
    }
});

/**
 * POST /api/threads/emails/apply-all-actions
 * Bulk apply actions for all pending junk/spam emails in Gmail
 */
router.post('/emails/apply-all-actions', requireAuth, async (req, res) => {
    try {
        const { category } = req.body;
        if (!['confirmed_junk'].includes(category)) {
            return res.status(400).json({ error: 'Category must be confirmed_junk' });
        }

        const action = await getSetting('junk_action') || 'move_to_junk';

        // Set up Gmail client if available
        let gmailClient = null;
        if (req.tokens) {
            gmailClient = gmail.getGmailClient({
                access_token: req.tokens.access_token,
                refresh_token: req.tokens.refresh_token,
            });
        }

        // Get Outlook access token — always refresh before applying actions
        let outlookAccessToken = null;
        if (req.outlookTokens) {
            if (req.outlookTokens.refresh_token) {
                try {
                    const newTokens = await outlook.refreshAccessToken(req.outlookTokens.refresh_token);
                    await saveOutlookTokens({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        expiry_date: newTokens.expiry_date,
                        email: req.outlookTokens.email,
                    });
                    outlookAccessToken = newTokens.access_token;
                } catch (err) {
                    console.error('⚠️ Outlook token refresh failed:', err.message);
                    // Fall back to existing token
                    outlookAccessToken = req.outlookTokens.access_token;
                }
            } else {
                outlookAccessToken = req.outlookTokens.access_token;
            }
        }

        const pending = await getPendingActions(category);
        let applied = 0;
        let errors = 0;

        for (const email of pending) {
            try {
                const provider = email.provider || 'gmail';

                if (provider === 'outlook' && outlookAccessToken) {
                    await outlook.applyOutlookAction(outlookAccessToken, email.gmail_id, action);
                } else if (provider === 'gmail' && gmailClient) {
                    await gmail.applyGmailAction(gmailClient, email.gmail_id, action);
                } else {
                    console.error(`   ❌ Skipped "${email.subject}" — no ${provider} client available`);
                    errors++;
                    continue;
                }

                await markActionTaken(email.id);
                await updateTriageResult(email.id, 'actioned', `Action applied: ${action}`, null);
                applied++;
            } catch (err) {
                console.error(`   ❌ Failed for "${email.subject}": ${err.message}`);
                errors++;
            }
        }

        console.log(`📬 Bulk action: ${applied} ${category} emails processed (${errors} errors)`);
        res.json({ message: `Applied action to ${applied} ${category} emails${errors > 0 ? ` (${errors} failed)` : ''}` });
    } catch (error) {
        console.error('❌ Bulk action error:', error.message);
        res.status(500).json({ error: 'Failed to apply actions: ' + error.message });
    }
});

/**
 * POST /api/threads/emails/dismiss-junk
 * Dismiss all confirmed_junk emails (mark as actioned without applying provider action).
 * Used when emails can't be actioned but user wants to clear the Trash tab.
 */
router.post('/emails/dismiss-junk', requireAuth, async (req, res) => {
    try {
        const result = await query(`
            UPDATE emails SET triage_category = 'actioned', triage_action_taken = 1
            WHERE triage_category = 'confirmed_junk'
        `);

        const dismissed = result.rowCount;
        console.log(`🗑️ Dismissed ${dismissed} emails from Trash`);
        res.json({ message: `Dismissed ${dismissed} emails.`, dismissedCount: dismissed });
    } catch (error) {
        console.error('❌ Dismiss error:', error.message);
        res.status(500).json({ error: 'Failed to dismiss emails: ' + error.message });
    }
});

/**
 * GET /api/threads/settings
 * Get current settings
 */
router.get('/settings/all', requireAuth, async (req, res) => {
    const settings = await getAllSettings();
    res.json({ settings });
});

/**
 * PATCH /api/threads/settings
 * Update settings
 */
router.patch('/settings/all', requireAuth, async (req, res) => {
    const { junk_action, auto_apply_actions, account_type, gmail_account_type, outlook_account_type, display_name } = req.body;

    if (junk_action) {
        if (!['move_to_junk', 'archive', 'delete', 'do_nothing'].includes(junk_action)) {
            return res.status(400).json({ error: 'Invalid junk_action' });
        }
        await setSetting('junk_action', junk_action);
    }
    // Per-provider account types
    if (gmail_account_type !== undefined) {
        if (!['personal', 'work'].includes(gmail_account_type)) {
            return res.status(400).json({ error: 'Invalid gmail_account_type' });
        }
        await setSetting('gmail_account_type', gmail_account_type);
    }
    if (outlook_account_type !== undefined) {
        if (!['personal', 'work'].includes(outlook_account_type)) {
            return res.status(400).json({ error: 'Invalid outlook_account_type' });
        }
        await setSetting('outlook_account_type', outlook_account_type);
    }
    // Legacy fallback
    if (account_type !== undefined) {
        if (!['personal', 'work'].includes(account_type)) {
            return res.status(400).json({ error: 'Invalid account_type' });
        }
        await setSetting('gmail_account_type', account_type);
    }
    if (auto_apply_actions !== undefined) {
        await setSetting('auto_apply_actions', String(auto_apply_actions));
    }
    if (display_name !== undefined) {
        await setSetting('display_name', String(display_name).trim());
    }

    res.json({ settings: await getAllSettings() });
});

/**
 * POST /api/threads/rules/apply
 * Apply all active rules (or a specific rule) to emails currently in the Inbox.
 */
router.post('/rules/apply', requireAuth, async (req, res) => {
    try {
        const { ruleId } = req.body;

        // Target: Emails currently sitting in the inbox view
        const result = await query(`
            SELECT id, from_email, subject, snippet, triage_category
            FROM emails
            WHERE triage_category IN ('unprocessed', 'important', 'regular')
        `);
        const emailsToProcess = result.rows;

        if (emailsToProcess.length === 0) {
            return res.json({ message: 'No emails in inbox to apply rules to.', recategorisedCount: 0 });
        }

        let rulesToApply = await getTriageRules('active');
        if (ruleId) rulesToApply = rulesToApply.filter(r => r.id === parseInt(ruleId));

        if (rulesToApply.length === 0) {
            return res.status(400).json({ error: 'No active rules found to apply.' });
        }

        console.log(`🧹 Applying ${rulesToApply.length} rules to ${emailsToProcess.length} inbox emails...`);
        const triageResults = await ai.triageEmails(emailsToProcess, rulesToApply);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        let reclassifiedCount = 0;

        for (const triageResult of triageResults) {
            const originalEmail = emailsToProcess.find(e => e.id === triageResult.id);
            if (originalEmail && originalEmail.triage_category !== triageResult.category) {
                // Keep as junk/spam (NOT confirmed_junk) so user can review in triage mode first
                await updateTriageResult(triageResult.id, triageResult.category, triageResult.reason);
                reclassifiedCount++;
            }
        }

        console.log(`✅ Rule application complete. Re-categorised ${reclassifiedCount} emails.`);
        res.json({ message: `Re-categorised ${reclassifiedCount} emails.`, recategorisedCount: reclassifiedCount });
    } catch (error) {
        console.error('❌ Failed to apply rules:', error.message);
        res.status(500).json({ error: 'Failed to apply rules: ' + error.message });
    }
});

/**
 * GET /api/threads/rules
 * List all triage rules (active + suggested)
 */
router.get('/rules/all', requireAuth, async (req, res) => {
    const rules = await getTriageRules();
    res.json({ rules });
});

/**
 * DELETE /api/threads/rules/:id
 * Delete a triage rule
 */
router.delete('/rules/:id', requireAuth, async (req, res) => {
    await deleteTriageRule(parseInt(req.params.id));
    res.json({ message: 'Rule deleted' });
});

/**
 * PATCH /api/threads/rules/:id/approve
 * Approve a suggested rule — makes it active
 */
router.patch('/rules/:id/approve', requireAuth, async (req, res) => {
    await approveSuggestedRule(parseInt(req.params.id));
    res.json({ message: 'Rule approved and activated' });
});

/**
 * POST /api/threads/rules
 * Manually add a new triage rule.
 */
router.post('/rules', requireAuth, async (req, res) => {
    const { sender_pattern, subject_pattern, category, reason } = req.body;
    if (!sender_pattern || !category) {
        return res.status(400).json({ error: 'sender_pattern and category are required' });
    }
    if (!['regular', 'junk', 'spam', 'for_review'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    const id = await addTriageRule({
        sender_pattern,
        subject_pattern: subject_pattern || null,
        category,
        reason: reason || 'Manually created rule',
        status: 'active',
    });
    console.log(`📚 Manually added rule #${id}: ${sender_pattern} → ${category}`);
    res.json({ message: 'Rule created', id, rules: await getTriageRules() });
});

/**
 * PATCH /api/threads/rules/:id
 * Edit an existing triage rule.
 */
router.patch('/rules/:id', requireAuth, async (req, res) => {
    const ruleId = parseInt(req.params.id);
    const { sender_pattern, subject_pattern, category, reason } = req.body;
    if (category && !['regular', 'junk', 'spam', 'for_review'].includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
    }
    await updateTriageRuleDef(ruleId, {
        sender_pattern,
        subject_pattern: subject_pattern || null,
        category,
        reason,
    });
    console.log(`📝 Updated rule #${ruleId}`);
    res.json({ message: 'Rule updated', rules: await getTriageRules() });
});
/**
 * Move all highlighted emails (junk/spam/for_review) to the Junk tab (confirmed_junk).
 */
router.post('/emails/move-to-junk', requireAuth, async (req, res) => {
    try {
        // Fetch all highlighted emails
        const junkEmails = await getEmailsByCategory('junk', { limit: 1000, offset: 0 });
        const spamEmails = await getEmailsByCategory('spam', { limit: 1000, offset: 0 });
        const forReviewEmails = await getEmailsByCategory('for_review', { limit: 1000, offset: 0 });

        const allHighlighted = [...junkEmails, ...spamEmails, ...forReviewEmails];

        if (allHighlighted.length === 0) {
            return res.json({ message: 'No highlighted emails to move.', movedCount: 0 });
        }

        for (const email of allHighlighted) {
            await updateTriageResult(email.id, 'confirmed_junk', email.triage_reason || 'Moved to Trash');
        }

        const movedCount = allHighlighted.length;
        console.log(`🗑️ Moved ${movedCount} highlighted emails to Trash`);

        // Now thread the remaining confirmed regular emails
        const threadStats = await threadConfirmedEmails(null, req.userEmail);
        console.log(`🧵 Threaded ${threadStats.threaded} confirmed emails`);

        res.json({
            message: `Moved ${movedCount} emails to Trash. Threaded ${threadStats.threaded} emails.`,
            movedCount,
            threadStats,
        });
    } catch (error) {
        console.error('❌ Failed to move emails to junk:', error.message);
        res.status(500).json({ error: 'Failed to move emails to junk: ' + error.message });
    }
});

/**
 * POST /api/threads/emails/revert-triage
 * Bulk revert triage categories (used when user cancels triage mode).
 * Expects { updates: [{ id, category, reason }] }
 */
router.post('/emails/revert-triage', requireAuth, async (req, res) => {
    try {
        const { updates } = req.body;
        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        await bulkUpdateTriageCategories(updates);
        console.log(`↩️ Reverted triage for ${updates.length} emails`);
        res.json({ message: `Reverted ${updates.length} emails to pre-analysis state.` });
    } catch (error) {
        console.error('❌ Revert triage error:', error.message);
        res.status(500).json({ error: 'Failed to revert triage: ' + error.message });
    }
});

/**
 * GET /emails/:id/thread-suggestions
 * Returns ranked thread candidates for an email.
 */
router.get('/emails/:id/thread-suggestions', requireAuth, async (req, res) => {
    try {
        const email = await getEmailById(parseInt(req.params.id));
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const existingThreads = await getThreads();
        const assignment = await ai.assignEmailToThread(email, existingThreads);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        // Build ranked list: existing thread matches + new thread option
        const suggestions = [];
        for (const match of (assignment.top_matches || [])) {
            const thread = existingThreads.find(t => t.id === match.thread_id);
            if (thread) {
                suggestions.push({
                    type: 'existing',
                    thread_id: thread.id,
                    title: thread.title,
                    category: thread.category,
                    confidence: match.confidence,
                });
            }
        }

        // Always include the "new thread" option
        const newThread = assignment.best_new_thread || {};
        suggestions.push({
            type: 'new',
            title: newThread.title || email.subject,
            category: newThread.category || 'other',
            confidence: newThread.confidence || 50,
        });

        res.json({ suggestions });
    } catch (error) {
        console.error('❌ Thread suggestions failed:', error.message);
        res.status(500).json({ error: 'Failed to get thread suggestions' });
    }
});

/**
 * POST /emails/:id/assign-thread
 * Manually assign an email to an existing or new thread.
 */
router.post('/emails/:id/assign-thread', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const email = await getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const { thread_id, new_thread_title, new_thread_category } = req.body;
        let targetThreadId;

        if (thread_id) {
            // Assign to existing thread
            targetThreadId = thread_id;
        } else {
            // Create new thread
            targetThreadId = await createThread({
                title: new_thread_title || email.subject,
                category: new_thread_category || 'other',
            });
        }

        // Assign with 100% confidence (user-chosen)
        await assignEmailToThread(emailId, targetThreadId, 100);

        // Update thread memory with the new email
        const thread = await getThreadWithEmails(targetThreadId);
        const updatedMemory = await ai.extractThreadMemory(thread.memory_bank, email);
        await updateThreadMemory(targetThreadId, updatedMemory);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.mid, 'mid');

        console.log(`📎 User assigned email #${emailId} → thread #${targetThreadId}`);

        res.json({
            message: 'Email assigned to thread',
            thread_id: targetThreadId,
        });
    } catch (error) {
        console.error('❌ Assign thread failed:', error.message);
        res.status(500).json({ error: 'Failed to assign email to thread' });
    }
});

/**
 * GET /threads/:id/email-suggestions
 * Returns ALL regular emails ranked by relevance to this thread.
 */
router.get('/:id/email-suggestions', requireAuth, async (req, res) => {
    try {
        const threadId = parseInt(req.params.id);
        const thread = await getThreadWithEmails(threadId);
        if (!thread) return res.status(404).json({ error: 'Thread not found' });

        // Get all regular emails (including those in other threads)
        const allEmails = await getAllRegularEmails(100);
        // Exclude emails already in THIS thread
        const candidates = allEmails.filter(e => e.semantic_thread_id !== threadId);

        if (candidates.length === 0) {
            return res.json({ suggestions: [] });
        }

        const scored = await ai.scoreEmailsForThread(thread, candidates);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.lite, 'lite');

        // Merge scores with email data
        const suggestions = scored.map(s => {
            const email = candidates.find(e => e.id === s.id);
            if (!email) return null;
            return {
                id: email.id,
                from_email: email.from_email,
                subject: email.subject,
                received_at: email.received_at,
                confidence: s.confidence,
                current_thread_id: email.semantic_thread_id || null,
            };
        }).filter(Boolean);

        res.json({ suggestions });
    } catch (error) {
        console.error('❌ Email suggestions failed:', error.message);
        res.status(500).json({ error: 'Failed to get email suggestions' });
    }
});

/**
 * POST /emails/:id/remove-from-thread
 * Remove an email from its current thread.
 */
router.post('/emails/:id/remove-from-thread', requireAuth, async (req, res) => {
    try {
        const emailId = parseInt(req.params.id);
        const email = await getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        await removeEmailFromThread(emailId);
        console.log(`📤 Removed email #${emailId} from thread #${email.semantic_thread_id}`);

        res.json({ message: 'Email removed from thread' });
    } catch (error) {
        console.error('❌ Remove from thread failed:', error.message);
        res.status(500).json({ error: 'Failed to remove email from thread' });
    }
});

/**
 * DELETE /threads/:id
 * Delete a thread and unassign all its emails.
 */
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        const threadId = parseInt(req.params.id);
        const thread = await getThreadWithEmails(threadId);
        if (!thread) return res.status(404).json({ error: 'Thread not found' });

        const emailCount = thread.emails?.length || 0;
        await deleteThreadDb(threadId);
        console.log(`🗑️ Deleted thread #${threadId} ("${thread.title}"), unassigned ${emailCount} emails`);

        res.json({ message: `Thread deleted. ${emailCount} emails unassigned.` });
    } catch (error) {
        console.error('❌ Delete thread failed:', error.message);
        res.status(500).json({ error: 'Failed to delete thread' });
    }
});

module.exports = router;
