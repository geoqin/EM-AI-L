/**
 * Outlook/Microsoft Graph email service
 * Mirrors gmail.js — uses Microsoft Graph API via simple fetch calls
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';

const SCOPES = ['openid', 'profile', 'email', 'Mail.ReadWrite', 'User.Read', 'offline_access'];

/**
 * Generate the Microsoft OAuth consent URL
 */
function getAuthUrl() {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        response_type: 'code',
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
        scope: SCOPES.join(' '),
        response_mode: 'query',
        prompt: 'consent',
    });
    return `${AUTH_BASE}/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
async function getTokensFromCode(code) {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI,
        grant_type: 'authorization_code',
        scope: SCOPES.join(' '),
    });

    const res = await fetch(`${AUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || err.error || 'Token exchange failed');
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || null,
        expiry_date: Date.now() + (data.expires_in * 1000),
    };
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(refreshToken) {
    const params = new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: SCOPES.join(' '),
    });

    const res = await fetch(`${AUTH_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error_description || err.error || 'Token refresh failed');
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refreshToken,
        expiry_date: Date.now() + (data.expires_in * 1000),
    };
}

/**
 * Make an authenticated Microsoft Graph API call
 */
async function graphFetch(accessToken, endpoint, options = {}) {
    const res = await fetch(`${GRAPH_BASE}${endpoint}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Graph API error: ${res.status}`);
    }

    // Some endpoints return 204 No Content
    if (res.status === 204) return null;
    return res.json();
}

/**
 * Get the authenticated user's email address
 */
async function getUserEmail(accessToken) {
    const profile = await graphFetch(accessToken, '/me');
    return profile.mail || profile.userPrincipalName;
}

/**
 * Fetch emails from Outlook — Focused inbox only (no junk/clutter/other)
 */
async function fetchEmails(accessToken, maxResults = 20) {
    // Graph API doesn't support combining $filter on inferenceClassification with $orderby.
    // Omitting $orderby — default return order is newest first.
    const inboxData = await graphFetch(accessToken,
        `/me/mailFolders/inbox/messages?$top=${maxResults}&$filter=inferenceClassification eq 'focused'&$select=id,subject,from,toRecipients,body,bodyPreview,receivedDateTime,conversationId`
    );
    const inboxMessages = inboxData?.value || [];

    return inboxMessages.map(msg => parseMessage(msg));
}

/**
 * Parse a Microsoft Graph message into the same shape as Gmail emails
 */
function parseMessage(message) {
    // Extract plain text body (Graph returns HTML by default)
    let body = '';
    if (message.body) {
        body = message.body.content || '';
        // Strip HTML tags for a rough plain text version
        if (message.body.contentType === 'html') {
            body = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    // Format "from" to match Gmail format: "Name <email>"
    const fromName = message.from?.emailAddress?.name || '';
    const fromEmail = message.from?.emailAddress?.address || '';
    const fromFormatted = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    // Format "to"
    const toAddresses = (message.toRecipients || [])
        .map(r => r.emailAddress?.address)
        .filter(Boolean)
        .join(', ');

    return {
        gmail_id: `outlook_${message.id}`, // Prefix to avoid collisions with Gmail IDs
        thread_id: message.conversationId || null,
        from_email: fromFormatted,
        to_email: toAddresses,
        subject: message.subject || '',
        body: body,
        snippet: message.bodyPreview || '',
        received_at: message.receivedDateTime ? new Date(message.receivedDateTime).toISOString() : null,
        gmail_spam: message._source === 'junk',
        provider: 'outlook',
    };
}

// --- Outlook Action Functions ---

/**
 * Move an email to Outlook's Junk Email folder
 */
async function moveToJunk(accessToken, messageId) {
    await graphFetch(accessToken, `/me/messages/${messageId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'junkemail' }),
    });
}

/**
 * Move an email to Outlook's Deleted Items (Trash)
 */
async function moveToTrash(accessToken, messageId) {
    await graphFetch(accessToken, `/me/messages/${messageId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'deleteditems' }),
    });
}

/**
 * Archive an email (move to Archive folder)
 */
async function archiveEmail(accessToken, messageId) {
    await graphFetch(accessToken, `/me/messages/${messageId}/move`, {
        method: 'POST',
        body: JSON.stringify({ destinationId: 'archive' }),
    });
}

/**
 * Apply a configured action to an email in Outlook
 * @param {string} action - move_to_junk | archive | delete | do_nothing
 */
async function applyOutlookAction(accessToken, outlookMessageId, action) {
    // Strip the outlook_ prefix we added during parsing
    const messageId = outlookMessageId.replace(/^outlook_/, '');

    switch (action) {
        case 'move_to_junk':
            await moveToJunk(accessToken, messageId);
            return 'Moved to junk';
        case 'archive':
            await archiveEmail(accessToken, messageId);
            return 'Archived';
        case 'delete':
            await moveToTrash(accessToken, messageId);
            return 'Moved to trash';
        case 'do_nothing':
            return 'No action taken';
        default:
            return 'Unknown action';
    }
}

/**
 * Send an email via Outlook/Graph API
 */
async function sendEmail(accessToken, { to, subject, body }) {
    await graphFetch(accessToken, '/me/sendMail', {
        method: 'POST',
        body: JSON.stringify({
            message: {
                subject,
                body: { contentType: 'Text', content: body },
                toRecipients: [{ emailAddress: { address: to } }],
            },
        }),
    });
}

module.exports = {
    getAuthUrl,
    getTokensFromCode,
    refreshAccessToken,
    graphFetch,
    getUserEmail,
    fetchEmails,
    parseMessage,
    applyOutlookAction,
    sendEmail,
};
