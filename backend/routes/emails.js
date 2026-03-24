const express = require('express');
const router = express.Router();
const gmail = require('../services/gmail');
const outlook = require('../services/outlook');
const { getTokens, getOutlookTokens, saveOutlookTokens, upsertEmail, getAllEmails, getEmailCount } = require('../db/database');

/**
 * Middleware: ensure user is authenticated (at least one provider)
 */
async function requireAuth(req, res, next) {
    const tokens = await getTokens();
    const outlookTokens = await getOutlookTokens();
    if (!tokens && !outlookTokens) {
        return res.status(401).json({ error: 'Not authenticated. Please sign in with Google or Outlook first.' });
    }
    req.tokens = tokens;
    req.outlookTokens = outlookTokens;
    next();
}

/**
 * GET /api/emails
 * Return stored emails from the database
 */
router.get('/', requireAuth, async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const emails = await getAllEmails({ limit, offset });
    const total = await getEmailCount();

    res.json({
        emails,
        total,
        limit,
        offset,
    });
});

/**
 * POST /api/emails/sync
 * Fetch latest emails from Gmail and/or Outlook and store in database
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        const maxResults = parseInt(req.query.max) || 20;
        const providerFilter = req.query.provider || 'all'; // 'all', 'gmail', or 'outlook'
        let newCount = 0;

        // Sync Gmail
        if (req.tokens && (providerFilter === 'all' || providerFilter === 'gmail')) {
            try {
                const gmailClient = gmail.getGmailClient({
                    access_token: req.tokens.access_token,
                    refresh_token: req.tokens.refresh_token,
                });

                const fetchedEmails = await gmail.fetchEmails(gmailClient, maxResults);
                for (const email of fetchedEmails) {
                    await upsertEmail({ ...email, provider: 'gmail' });
                    newCount++;
                }
                console.log(`✅ Synced ${fetchedEmails.length} emails from Gmail`);
            } catch (err) {
                console.error('❌ Gmail sync error:', err.message);
                if (err.message.includes('invalid_grant') || err.message.includes('Token has been expired')) {
                    console.log('⚠️ Gmail token expired — skipping Gmail sync');
                }
            }
        }

        // Sync Outlook
        if (req.outlookTokens && (providerFilter === 'all' || providerFilter === 'outlook')) {
            try {
                let accessToken = req.outlookTokens.access_token;

                // Refresh if expired
                if (req.outlookTokens.expiry_date && Date.now() > req.outlookTokens.expiry_date && req.outlookTokens.refresh_token) {
                    const newTokens = await outlook.refreshAccessToken(req.outlookTokens.refresh_token);
                    await saveOutlookTokens({
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token,
                        expiry_date: newTokens.expiry_date,
                        email: req.outlookTokens.email,
                    });
                    accessToken = newTokens.access_token;
                }

                const fetchedEmails = await outlook.fetchEmails(accessToken, maxResults);
                for (const email of fetchedEmails) {
                    await upsertEmail(email); // provider already set to 'outlook' in outlook.parseMessage
                    newCount++;
                }
                console.log(`✅ Synced ${fetchedEmails.length} emails from Outlook`);
            } catch (err) {
                console.error('❌ Outlook sync error:', err.message);
            }
        }

        const allEmails = await getAllEmails({ limit: 200 });
        const total = await getEmailCount();

        res.json({
            message: `Synced ${newCount} emails`,
            emails: allEmails,
            total,
        });
    } catch (error) {
        console.error('❌ Sync error:', error.message);
        res.status(500).json({ error: 'Failed to sync emails: ' + error.message });
    }
});

module.exports = router;
