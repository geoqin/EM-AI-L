const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ai = require('../services/ai');
const gmail = require('../services/gmail');
const outlook = require('../services/outlook');
const { deductUserCredits, CREDIT_COSTS } = require('../middleware/credits');

async function requireAuth(req, res, next) {
    const tokens = await db.getTokens();
    const outlookTokens = await db.getOutlookTokens();
    if (!tokens && !outlookTokens) return res.status(401).json({ error: 'Not authenticated.' });
    req.tokens = tokens;
    req.outlookTokens = outlookTokens;
    next();
}

/**
 * POST /api/chat/briefing
 * Fetch unread important emails and generate a conversational briefing.
 */
router.post('/briefing', requireAuth, async (req, res) => {
    try {
        const tone = await db.getSetting('chat_tone') || 'concise';
        const unbriefed = await db.getUnbriefedEmails();

        console.log(`\n💬 Chat briefing: ${unbriefed.length} unbriefed emails`);

        const briefing = await ai.generateBriefing(unbriefed, tone);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.mid, 'mid');

        // Mark emails as briefed
        if (unbriefed.length > 0) {
            await db.markAsBriefed(unbriefed.map(e => e.id));
        }

        // Return the full email objects too so the frontend can reference them
        res.json({
            briefing,
            emails: unbriefed.map(e => ({
                id: e.id,
                gmail_id: e.gmail_id,
                thread_id: e.thread_id,
                from_email: e.from_email,
                subject: e.subject,
                snippet: e.snippet,
                received_at: e.received_at,
            })),
        });
    } catch (error) {
        console.error('❌ Briefing error:', error.message);
        res.status(500).json({ error: 'Failed to generate briefing: ' + error.message });
    }
});

/**
 * POST /api/chat/respond
 * Process a user message in the chat conversation context.
 * If the AI determines a draft should be generated, it does so automatically.
 * If triage intent is detected, it actually updates the email categories.
 */
router.post('/respond', requireAuth, async (req, res) => {
    try {
        const { messages, userMessage, emailId } = req.body;
        const tone = await db.getSetting('chat_tone') || 'concise';

        // Get email context if provided
        let emailContext = null;
        if (emailId) {
            emailContext = await db.getEmailById(emailId);
        }

        // To let the AI know what emails are recently available for triage,
        // we pass a lightweight list of the last 50 emails (ID, sender, subject only
        // so we don't blow up the context window).
        const allRecentEmails = await db.getAllEmails({ limit: 50 }) || [];
        const triageContextEmails = allRecentEmails.map(e => ({
            id: e.id,
            from_email: e.from_email,
            subject: e.subject
        }));

        // Process user message
        const chatResult = await ai.chatRespond(messages || [], userMessage, emailContext, triageContextEmails, tone);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.mid, 'mid');

        let draft = null;
        if (chatResult.should_draft) {
            // Resolve email context: prefer explicit context, then AI's target_email_id
            let draftEmail = emailContext;
            let draftEmailId = emailId;

            if (!draftEmail && chatResult.target_email_id) {
                draftEmail = await db.getEmailById(chatResult.target_email_id);
                draftEmailId = chatResult.target_email_id;
            }

            if (draftEmail) {
                draft = await ai.generateReplyDraft(draftEmail, chatResult.draft_instructions || userMessage, tone);
                await deductUserCredits(req.userEmail, CREDIT_COSTS.pro, 'pro');
                draft.emailId = draftEmailId;
                draft.to = draftEmail.from_email;
                console.log(`📝 Generated draft reply for "${draftEmail.subject}"`);
            } else {
                console.warn('⚠️ AI requested draft but no email context could be resolved');
            }
        }

        // Handle Triage Intent actually moving emails
        let triagedCount = 0;
        if (chatResult.intent === 'triage' && chatResult.triage_email_ids?.length > 0 && chatResult.triage_category) {
            for (const id of chatResult.triage_email_ids) {
                await db.updateTriageResult(id, chatResult.triage_category, 'Triaged via AI Chat Assistant');
                triagedCount++;
            }
            console.log(`🧹 Chat assistant triaged ${triagedCount} emails to ${chatResult.triage_category}`);
        }

        // Handle Suggest Rule intent — propose rule WITHOUT creating it yet
        // The rule is only created when the user confirms (confirm_rule intent)
        let suggestedRule = null;
        if (chatResult.intent === 'suggest_rule' && chatResult.suggested_rule) {
            const rule = chatResult.suggested_rule;
            if (rule.sender_pattern && rule.category) {
                // Return the proposed rule to the frontend but don't persist it
                suggestedRule = { ...rule, pending: true };
                console.log(`💡 Chat proposed rule (awaiting confirmation): ${rule.sender_pattern} → ${rule.category}`);
            }
        }

        // Handle Confirm Rule intent — user confirmed a previously proposed rule
        if (chatResult.intent === 'confirm_rule' && chatResult.suggested_rule) {
            const rule = chatResult.suggested_rule;
            if (rule.sender_pattern && rule.category) {
                await db.addTriageRule({
                    sender_pattern: rule.sender_pattern,
                    subject_pattern: rule.subject_pattern || null,
                    category: rule.category,
                    reason: rule.reason || 'Confirmed via chat',
                    status: 'active',
                });
                suggestedRule = rule;
                console.log(`✅ Chat confirmed rule: ${rule.sender_pattern} → ${rule.category}`);
            }
        }

        res.json({
            response: chatResult.response,
            intent: chatResult.intent,
            draft,
            triagedCount,
            triageCategory: chatResult.triage_category,
            suggestedRule,
        });
    } catch (error) {
        console.error('❌ Chat respond error:', error.message);
        res.status(500).json({ error: 'Failed to process message: ' + error.message });
    }
});

/**
 * POST /api/chat/draft
 * Generate a reply draft for a specific email.
 */
router.post('/draft', requireAuth, async (req, res) => {
    try {
        const { emailId, instructions } = req.body;
        const tone = await db.getSetting('chat_tone') || 'concise';

        const email = await db.getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const draft = await ai.generateReplyDraft(email, instructions, tone);
        await deductUserCredits(req.userEmail, CREDIT_COSTS.pro, 'pro');
        draft.emailId = emailId;
        draft.to = email.from_email;

        res.json({ draft });
    } catch (error) {
        console.error('❌ Draft error:', error.message);
        res.status(500).json({ error: 'Failed to generate draft: ' + error.message });
    }
});

/**
 * POST /api/chat/send
 * Send an approved email draft via the email's original provider.
 */
router.post('/send', requireAuth, async (req, res) => {
    try {
        const { emailId, subject, body } = req.body;

        const email = await db.getEmailById(emailId);
        if (!email) return res.status(404).json({ error: 'Email not found' });

        const replySubject = subject || `Re: ${email.subject}`;
        const toAddress = email.from_email;

        if (email.provider === 'outlook' && req.outlookTokens) {
            await outlook.sendEmail(req.outlookTokens.access_token, {
                to: toAddress,
                subject: replySubject,
                body,
            });
            console.log(`📤 Sent Outlook reply to "${toAddress}" re: "${email.subject}"`);
            res.json({ message: 'Email sent via Outlook!' });
        } else if (req.tokens) {
            const gmailClient = gmail.getGmailClient({
                access_token: req.tokens.access_token,
                refresh_token: req.tokens.refresh_token,
            });

            const result = await gmail.sendEmail(gmailClient, {
                to: toAddress,
                subject: replySubject,
                body,
                inReplyTo: email.gmail_id,
                gmailThreadId: email.thread_id,
            });
            console.log(`📤 Sent Gmail reply to "${toAddress}" re: "${email.subject}"`);
            res.json({ message: 'Email sent!', messageId: result.id });
        } else {
            return res.status(400).json({ error: 'No email provider available to send from' });
        }
    } catch (error) {
        console.error('❌ Send error:', error.message);
        res.status(500).json({ error: 'Failed to send email: ' + error.message });
    }
});

module.exports = router;
