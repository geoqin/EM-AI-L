const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Wrapper that adds credentials to all requests
async function apiFetch(url, options = {}) {
    return fetch(url, { ...options, credentials: 'include' });
}

export async function checkAuthStatus() {
    const res = await apiFetch(`${API_BASE}/auth/status`);
    return res.json();
}

export function getLoginUrl() {
    return `${API_BASE}/auth/google`;
}

export function getOutlookLoginUrl() {
    return `${API_BASE}/auth/outlook`;
}

export async function disconnectOutlook() {
    const res = await apiFetch(`${API_BASE}/auth/outlook/logout`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to disconnect Outlook');
    return res.json();
}

export async function disconnectGoogle() {
    const res = await apiFetch(`${API_BASE}/auth/google/logout`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to disconnect Google');
    return res.json();
}


export async function moveHighlightedToJunk() {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/move-to-junk`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to move emails to junk');
    return res.json();
}

export async function revertTriage(updates) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/revert-triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
    });
    if (!res.ok) throw new Error('Failed to revert triage');
    return res.json();
}

export async function getEmails(limit = 50, offset = 0) {
    const res = await apiFetch(`${API_BASE}/api/emails?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch emails');
    return res.json();
}

export async function syncEmails(max = 20, provider = 'all') {
    const res = await apiFetch(`${API_BASE}/api/emails/sync?max=${max}&provider=${provider}`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to sync emails');
    }
    return res.json();
}

// --- Thread API ---

export async function getThreads() {
    const res = await apiFetch(`${API_BASE}/api/threads`);
    if (!res.ok) throw new Error('Failed to fetch threads');
    return res.json();
}

export async function getThreadDetail(threadId) {
    const res = await apiFetch(`${API_BASE}/api/threads/${threadId}`);
    if (!res.ok) throw new Error('Failed to fetch thread');
    return res.json();
}

export async function processEmails() {
    const res = await apiFetch(`${API_BASE}/api/threads/process`, { method: 'POST' });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Processing failed');
    }
    return res.json();
}

/**
 * Stream processing progress via SSE using fetch streams.
 * @param {function} onProgress - Called with each progress message string
 * @returns {Promise<object>} - Final stats from the done event
 */
export async function processEmailsStream(onProgress) {
    const res = await apiFetch(`${API_BASE}/api/threads/process-stream`);
    if (!res.ok) throw new Error('Failed to start processing stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE lines: each event is "data: {...}\n\n"
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'progress') {
                    onProgress?.(data.message);
                } else if (data.type === 'done') {
                    result = { message: data.message, stats: data.stats };
                } else if (data.type === 'error') {
                    throw new Error(data.message);
                }
            } catch (err) {
                if (err.message && err.message !== 'Unexpected end of JSON input') throw err;
            }
        }
    }

    if (!result) throw new Error('Processing stream ended without completion');
    return result;
}

export async function getEmailsByCategory(category, limit = 50, offset = 0) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${category}?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error('Failed to fetch emails');
    return res.json();
}

export async function overrideTriage(emailId, category) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/triage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
    });
    if (!res.ok) throw new Error('Failed to update triage');
    return res.json();
}

export async function applyAction(emailId) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/apply-action`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to apply action');
    return res.json();
}

export async function applyAllActions(category) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/apply-all-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
    });
    if (!res.ok) throw new Error('Failed to apply actions');
    return res.json();
}

export async function dismissJunk() {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/dismiss-junk`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to dismiss emails');
    return res.json();
}

export async function getSettings() {
    const res = await apiFetch(`${API_BASE}/api/threads/settings/all`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
}

export async function updateSettings(settings) {
    const res = await apiFetch(`${API_BASE}/api/threads/settings/all`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
}

// --- Triage Rules ---

export async function getTriageRules() {
    const res = await apiFetch(`${API_BASE}/api/threads/rules/all`);
    if (!res.ok) throw new Error('Failed to fetch rules');
    return res.json();
}

export async function deleteTriageRule(ruleId) {
    const res = await apiFetch(`${API_BASE}/api/threads/rules/${ruleId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete rule');
    return res.json();
}

export async function generateRule(emailId, category, reasoning) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/generate-rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, reasoning }),
    });
    if (!res.ok) throw new Error('Failed to generate rule');
    return res.json();
}

// --- Chat API ---

export async function getChatBriefing() {
    const res = await apiFetch(`${API_BASE}/api/chat/briefing`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to get briefing');
    return res.json();
}

export async function sendChatMessage(messages, userMessage, emailId) {
    const res = await apiFetch(`${API_BASE}/api/chat/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, userMessage, emailId }),
    });
    if (!res.ok) throw new Error('Failed to process message');
    return res.json();
}

export async function generateDraft(emailId, instructions) {
    const res = await apiFetch(`${API_BASE}/api/chat/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, instructions }),
    });
    if (!res.ok) throw new Error('Failed to generate draft');
    return res.json();
}

export async function sendDraft(emailId, subject, body) {
    const res = await apiFetch(`${API_BASE}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailId, subject, body }),
    });
    if (!res.ok) throw new Error('Failed to send email');
    return res.json();
}

export async function approveRule(ruleId) {
    const res = await apiFetch(`${API_BASE}/api/threads/rules/${ruleId}/approve`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to approve rule');
    return res.json();
}

export async function applyRulesToInbox(ruleId = null) {
    const res = await apiFetch(`${API_BASE}/api/threads/rules/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleId }),
    });
    if (!res.ok) throw new Error('Failed to apply rules');
    return res.json();
}

export async function addRule({ sender_pattern, subject_pattern, category, reason }) {
    const res = await apiFetch(`${API_BASE}/api/threads/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_pattern, subject_pattern, category, reason }),
    });
    if (!res.ok) throw new Error('Failed to add rule');
    return res.json();
}

export async function updateRule(ruleId, { sender_pattern, subject_pattern, category, reason }) {
    const res = await apiFetch(`${API_BASE}/api/threads/rules/${ruleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_pattern, subject_pattern, category, reason }),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    return res.json();
}

// --- Thread Picker API ---

export async function getThreadSuggestions(emailId) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/thread-suggestions`);
    if (!res.ok) throw new Error('Failed to get thread suggestions');
    return res.json();
}

export async function assignEmailToThread(emailId, { thread_id, new_thread_title, new_thread_category } = {}) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/assign-thread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id, new_thread_title, new_thread_category }),
    });
    if (!res.ok) throw new Error('Failed to assign email to thread');
    return res.json();
}

export async function getEmailSuggestionsForThread(threadId) {
    const res = await apiFetch(`${API_BASE}/api/threads/${threadId}/email-suggestions`);
    if (!res.ok) throw new Error('Failed to get email suggestions');
    return res.json();
}

export async function removeEmailFromThread(emailId) {
    const res = await apiFetch(`${API_BASE}/api/threads/emails/${emailId}/remove-from-thread`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to remove email from thread');
    return res.json();
}

export async function deleteThread(threadId) {
    const res = await apiFetch(`${API_BASE}/api/threads/${threadId}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete thread');
    return res.json();
}
