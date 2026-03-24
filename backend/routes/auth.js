const express = require('express');
const router = express.Router();
const gmail = require('../services/gmail');
const outlook = require('../services/outlook');
const { saveTokens, getTokens, getSetting, saveOutlookTokens, getOutlookTokens, deleteOutlookTokens, getOrCreateUser, getUserCredits, query } = require('../db/database');

/**
 * GET /auth/google
 * Redirect user to Google OAuth consent screen
 */
router.get('/google', (req, res) => {
    const authUrl = gmail.getAuthUrl();
    res.redirect(authUrl);
});

/**
 * GET /auth/google/callback
 * Handle OAuth callback, store tokens, redirect to frontend
 */
router.get('/google/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    try {
        const tokens = await gmail.getTokensFromCode(code);
        await saveTokens({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expiry_date: tokens.expiry_date || null,
        });
        console.log('✅ Google OAuth tokens saved');

        // Get user email and register/identify user
        try {
            const gmailClient = gmail.getGmailClient(tokens);
            const profile = await gmailClient.users.getProfile({ userId: 'me' });
            const email = profile.data.emailAddress;
            if (email) {
                await getOrCreateUser(email);
                const isProduction = process.env.NODE_ENV === 'production';
                res.cookie('user_email', email, {
                    signed: true, httpOnly: true,
                    maxAge: 30 * 24 * 60 * 60 * 1000,
                    sameSite: isProduction ? 'none' : 'lax',
                    secure: isProduction,
                });
            }
        } catch (e) { console.log('⚠️ Could not set user cookie:', e.message); }

        // Redirect to frontend
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/app?auth=success`);
    } catch (error) {
        console.error('❌ Google OAuth error:', error.message);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/app?auth=error`);
    }
});

// --- Outlook OAuth ---

/**
 * GET /auth/outlook
 * Redirect user to Microsoft OAuth consent screen
 */
router.get('/outlook', (req, res) => {
    const authUrl = outlook.getAuthUrl();
    res.redirect(authUrl);
});

/**
 * GET /auth/outlook/callback
 * Handle Microsoft OAuth callback, store tokens, redirect to frontend
 */
router.get('/outlook/callback', async (req, res) => {
    const { code, error: authError } = req.query;

    if (authError) {
        console.error('❌ Outlook OAuth denied:', authError);
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/app?auth=outlook_error&reason=${authError}`);
    }

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    try {
        const tokens = await outlook.getTokensFromCode(code);

        // Get user email
        let email = null;
        try {
            email = await outlook.getUserEmail(tokens.access_token);
        } catch (err) {
            console.log('⚠️ Could not get Outlook user email:', err.message);
        }

        await saveOutlookTokens({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
            email,
        });
        console.log(`✅ Outlook OAuth tokens saved${email ? ` for ${email}` : ''}`);

        // Register/identify user
        if (email) {
            await getOrCreateUser(email);
            const isProduction = process.env.NODE_ENV === 'production';
            res.cookie('user_email', email, {
                signed: true, httpOnly: true,
                maxAge: 30 * 24 * 60 * 60 * 1000,
                sameSite: isProduction ? 'none' : 'lax',
                secure: isProduction,
            });
        }

        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/app?auth=outlook_success`);
    } catch (error) {
        console.error('❌ Outlook OAuth error:', error.message);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/app?auth=outlook_error`);
    }
});

/**
 * POST /auth/outlook/logout
 * Disconnect Outlook account
 */
router.post('/outlook/logout', async (req, res) => {
    await deleteOutlookTokens();
    console.log('🔌 Outlook account disconnected');
    res.json({ success: true });
});

// --- Status ---

/**
 * GET /auth/status
 * Check if user is authenticated (Google + Outlook)
 */
router.get('/status', async (req, res) => {
    const tokens = await getTokens();
    const outlookTokens = await getOutlookTokens();

    let googleAuth = { authenticated: false, email: null, name: null };
    let outlookAuth = { authenticated: false, email: null };

    // Google status
    if (tokens) {
        try {
            const gmailClient = gmail.getGmailClient(tokens);
            const profile = await gmailClient.users.getProfile({ userId: 'me' });
            let displayName = null;
            try {
                const { google } = require('googleapis');
                const oauth2 = google.oauth2({ version: 'v2', auth: gmail.getAuthClient(tokens) });
                const me = await oauth2.userinfo.get();
                displayName = me.data.name || null;
            } catch { /* Name fetch failed */ }
            googleAuth = {
                authenticated: true,
                hasRefreshToken: !!(tokens?.refresh_token),
                email: profile.data.emailAddress,
                name: displayName,
            };
        } catch (err) {
            googleAuth = {
                authenticated: true,
                hasRefreshToken: !!(tokens?.refresh_token),
                email: null,
                name: null,
            };
        }
    }

    // Outlook status
    if (outlookTokens) {
        // Check if token needs refresh
        if (outlookTokens.expiry_date && Date.now() > outlookTokens.expiry_date && outlookTokens.refresh_token) {
            try {
                const newTokens = await outlook.refreshAccessToken(outlookTokens.refresh_token);
                await saveOutlookTokens({
                    access_token: newTokens.access_token,
                    refresh_token: newTokens.refresh_token,
                    expiry_date: newTokens.expiry_date,
                    email: outlookTokens.email,
                });
            } catch (err) {
                console.log('⚠️ Outlook token refresh failed:', err.message);
            }
        }

        // Get display name from Outlook if not available from Google
        let outlookName = null;
        try {
            const profile = await outlook.getUserEmail(outlookTokens.access_token);
            // getUserEmail returns just the email, but we can get the name from /me
            const meData = await outlook.graphFetch(outlookTokens.access_token, '/me');
            outlookName = meData.displayName || null;
        } catch { /* Name fetch failed */ }

        outlookAuth = {
            authenticated: true,
            email: outlookTokens.email || null,
            name: outlookName,
        };
    }

    // User is authenticated if EITHER provider is connected
    const isAuthenticated = googleAuth.authenticated || outlookAuth.authenticated;
    const storedName = await getSetting('display_name');

    // For the top-level fields, use whichever provider is available (prefer Google for backwards compat)
    const primaryEmail = googleAuth.email || outlookAuth.email || null;
    const primaryName = storedName || googleAuth.name || outlookAuth.name || null;

    // Ensure user cookie is set (handles existing users who logged in before cookie system)
    if (isAuthenticated && primaryEmail && !req.signedCookies?.user_email) {
        await getOrCreateUser(primaryEmail);
        const isProduction = process.env.NODE_ENV === 'production';
        res.cookie('user_email', primaryEmail, {
            signed: true, httpOnly: true,
            maxAge: 30 * 24 * 60 * 60 * 1000,
            sameSite: isProduction ? 'none' : 'lax',
            secure: isProduction,
        });
    }

    // Get credit info
    const userEmail = req.signedCookies?.user_email || primaryEmail;
    const credits = userEmail ? await getUserCredits(userEmail) : null;

    res.json({
        authenticated: isAuthenticated,
        email: primaryEmail,
        name: primaryName,
        hasRefreshToken: googleAuth.hasRefreshToken || false,
        // Individual provider status
        googleAuthenticated: googleAuth.authenticated,
        googleEmail: googleAuth.email,
        outlookAuthenticated: outlookAuth.authenticated,
        outlookEmail: outlookAuth.email,
        // Credit info
        credits,
    });
});

/**
 * POST /auth/logout
 * Clear all stored tokens (full logout)
 */
router.post('/logout', async (req, res) => {
    await query('DELETE FROM tokens WHERE id = 1');
    await deleteOutlookTokens();
    res.clearCookie('user_email');
    console.log('🔌 Full logout — all tokens cleared');
    res.json({ success: true });
});

/**
 * POST /auth/google/logout
 * Disconnect Google account only (keeps Outlook if connected)
 */
router.post('/google/logout', async (req, res) => {
    await query('DELETE FROM tokens WHERE id = 1');
    console.log('🔌 Google account disconnected');
    res.json({ success: true });
});

module.exports = router;
