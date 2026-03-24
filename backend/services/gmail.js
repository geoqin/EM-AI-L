const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.REDIRECT_URI
    );
}

/**
 * Generate the Google OAuth consent URL
 */
function getAuthUrl() {
    const oauth2Client = createOAuth2Client();
    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent', // Force consent to get refresh token
    });
}

/**
 * Exchange authorization code for tokens
 */
async function getTokensFromCode(code) {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
}

/**
 * Create an authenticated Gmail client from stored tokens
 */
function getGmailClient(tokens) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    return google.gmail({ version: 'v1', auth: oauth2Client });
}

/**
 * Return a configured OAuth2 client (useful for non-Gmail Google APIs)
 */
function getAuthClient(tokens) {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials(tokens);
    return oauth2Client;
}

/**
 * Fetch emails from Gmail — Primary inbox only (no spam/promotions/social/updates)
 */
async function fetchEmails(gmailClient, maxResults = 20) {
    const inboxRes = await gmailClient.users.messages.list({
        userId: 'me',
        maxResults,
        q: 'category:primary',
    });
    const inboxMessages = inboxRes.data.messages || [];

    if (inboxMessages.length === 0) return [];

    // Fetch full details for each message
    const emails = await Promise.all(
        inboxMessages.map(async (msg) => {
            const detail = await gmailClient.users.messages.get({
                userId: 'me',
                id: msg.id,
                format: 'full',
            });
            return parseMessage(detail.data);
        })
    );

    return emails;
}

/**
 * Parse a Gmail API message into a clean object
 */
function parseMessage(message) {
    const headers = message.payload?.headers || [];

    const getHeader = (name) => {
        const header = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
        return header?.value || '';
    };

    // Extract body text
    let body = '';
    if (message.payload?.body?.data) {
        body = decodeBase64(message.payload.body.data);
    } else if (message.payload?.parts) {
        body = extractBodyFromParts(message.payload.parts);
    }

    return {
        gmail_id: message.id,
        thread_id: message.threadId,
        from_email: getHeader('From'),
        to_email: getHeader('To'),
        subject: getHeader('Subject'),
        body: body,
        snippet: message.snippet || '',
        received_at: new Date(parseInt(message.internalDate)).toISOString(),
    };
}

/**
 * Recursively extract plain text body from MIME parts
 */
function extractBodyFromParts(parts) {
    for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
            return decodeBase64(part.body.data);
        }
        if (part.parts) {
            const nested = extractBodyFromParts(part.parts);
            if (nested) return nested;
        }
    }

    // Fallback to HTML if no plain text
    for (const part of parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
            return decodeBase64(part.body.data);
        }
    }

    return '';
}

/**
 * Decode base64url-encoded string
 */
function decodeBase64(data) {
    return Buffer.from(data, 'base64url').toString('utf-8');
}

// --- Gmail Action Functions (require gmail.modify scope) ---

/**
 * Move an email to Gmail's Spam folder
 */
async function moveToSpam(gmailClient, gmailMessageId) {
    await gmailClient.users.messages.modify({
        userId: 'me',
        id: gmailMessageId,
        requestBody: {
            addLabelIds: ['SPAM'],
            removeLabelIds: ['INBOX'],
        },
    });
}

/**
 * Move an email to Gmail's Trash
 */
async function moveToTrash(gmailClient, gmailMessageId) {
    await gmailClient.users.messages.trash({
        userId: 'me',
        id: gmailMessageId,
    });
}

/**
 * Archive an email (remove from Inbox)
 */
async function archiveEmail(gmailClient, gmailMessageId) {
    await gmailClient.users.messages.modify({
        userId: 'me',
        id: gmailMessageId,
        requestBody: {
            removeLabelIds: ['INBOX'],
        },
    });
}

/**
 * Apply a configured action to an email in Gmail
 * @param {string} action - move_to_junk | archive | delete | do_nothing
 */
async function applyGmailAction(gmailClient, gmailMessageId, action) {
    switch (action) {
        case 'move_to_junk':
            await moveToSpam(gmailClient, gmailMessageId);
            return 'Moved to spam';
        case 'archive':
            await archiveEmail(gmailClient, gmailMessageId);
            return 'Archived';
        case 'delete':
            await moveToTrash(gmailClient, gmailMessageId);
            return 'Moved to trash';
        case 'do_nothing':
            return 'No action taken';
        default:
            return 'Unknown action';
    }
}

/**
 * Send an email via Gmail API.
 * Constructs MIME message with proper threading headers.
 */
async function sendEmail(gmailClient, { to, subject, body, inReplyTo, references, gmailThreadId }) {
    const messageParts = [
        `To: ${to}`,
        `Subject: ${subject}`,
        'Content-Type: text/plain; charset=utf-8',
        'MIME-Version: 1.0',
    ];

    if (inReplyTo) {
        messageParts.push(`In-Reply-To: ${inReplyTo}`);
        messageParts.push(`References: ${references || inReplyTo}`);
    }

    messageParts.push('', body);

    const rawMessage = messageParts.join('\r\n');
    const encoded = Buffer.from(rawMessage).toString('base64url');

    const sendParams = {
        userId: 'me',
        requestBody: {
            raw: encoded,
        },
    };

    // Thread the reply in Gmail if we have the thread ID
    if (gmailThreadId) {
        sendParams.requestBody.threadId = gmailThreadId;
    }

    const result = await gmailClient.users.messages.send(sendParams);
    return result.data;
}

module.exports = {
    getAuthUrl,
    getTokensFromCode,
    getGmailClient,
    getAuthClient,
    fetchEmails,
    parseMessage,
    applyGmailAction,
    sendEmail,
};
