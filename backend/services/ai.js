const { generate } = require('./providers');

/**
 * Stage 1: Batch triage — classify emails as important/filtered/needs_review in one call.
 * Uses only snippet + subject + sender to minimise tokens.
 * @param {Array} rules - Learned triage rules from user overrides
 */
async function triageEmails(emails, rules = [], accountType = 'personal') {
    if (emails.length === 0) return [];

    const emailList = emails.map((e, i) => ({
        index: i,
        id: e.id,
        from: e.from_email,
        subject: e.subject,
        snippet: e.snippet,
    }));

    const rulesSection = rules.length > 0
        ? `\nUSER-DEFINED RULES (these override default behaviour — follow them strictly):
${rules.map(r => `- Emails from "${r.sender_pattern}" → classify as "${r.category}" (${r.reason})`).join('\n')}
`
        : '';

    const accountContext = accountType === 'work'
        ? "This is a WORK email account. Prioritise work communications, internal company emails, and professional tools over personal marketing."
        : "This is a PERSONAL email account. Standard personal triage rules apply.";

    const prompt = `You are an intelligent email triage assistant. ${accountContext} Classify each email below as one of:
- "junk": Clearly unwanted — marketing newsletters, promotional offers, social media notifications, automated digests, phishing, scams. The user definitely doesn't want these.
- "spam": Suspicious or malicious — phishing attempts, scam offers, impersonation, fake prizes. A stronger signal than junk.
- "for_review": Borderline — might be junk or might be legitimate. Examples: verification codes, password resets, order confirmations from unfamiliar retailers, transactional emails from unknown services. The user should glance at these.
- "regular": Normal emails — personal messages, work communications, financial alerts, shipping updates, receipts, appointment reminders. Anything the user would want to see.

Key guidelines:
- A personal email from a real person = always regular
- A newsletter from a service the user signed up for = junk (not for_review)
- A verification code = for_review (user may have requested it)
- Receipts and shipping confirmations from known stores = regular
- Order confirmations from unknown stores = for_review
- Anything unsolicited and suspicious = spam
${rulesSection}
For each email, provide:
- "id": the email id (number)
- "category": "junk" | "spam" | "for_review" | "regular"
- "confidence": 0-100 (how confident you are in this classification)
- "reason": brief explanation (15 words max)

EMAILS:
${JSON.stringify(emailList, null, 2)}

Return a JSON array of objects with "id", "category", "confidence", and "reason" fields.`;

    const text = await generate(prompt, 'lite');

    try {
        const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('❌ Failed to parse triage response:', text);
        throw new Error('AI triage response was not valid JSON');
    }
}

/**
 * Stage 2a: Decide which semantic thread an email belongs to.
 */
async function assignEmailToThread(email, existingThreads, suppressedThreads = []) {
    const threadSummaries = existingThreads.map(t => ({
        id: t.id,
        title: t.title,
        category: t.category,
        memory: t.memory_bank ? (typeof t.memory_bank === 'string' ? JSON.parse(t.memory_bank) : t.memory_bank) : {},
    }));

    const suppressionSection = suppressedThreads.length > 0
        ? `\nSUPPRESSED THREADS (the user previously DELETED these threads — do NOT recreate similar ones):
${suppressedThreads.map(s => `- "${s.title}" (category: ${s.category}, senders: ${s.senders})`).join('\n')}
`
        : '';

    const prompt = `You are an email threading assistant. Given this new email and existing semantic threads, rank the best thread matches.

NEW EMAIL:
From: ${email.from_email}
Subject: ${email.subject}
Date: ${email.received_at}
Body: ${(email.body || '').slice(0, 1000)}

EXISTING THREADS:
${existingThreads.length === 0 ? '(none yet)' : JSON.stringify(threadSummaries, null, 2)}
${suppressionSection}
Return JSON:
{
  "top_matches": [
    { "thread_id": number, "confidence": 0-100 }
  ],
  "best_new_thread": {
    "title": "descriptive title if creating new",
    "category": "work" | "personal" | "finance" | "shopping" | "social" | "other",
    "confidence": 0-100
  }
}

Rules:
- Return up to 3 top_matches, sorted by confidence (highest first).
- Only include matches with confidence >= 30.
- Always include best_new_thread as a fallback option.
- If no existing thread is a strong match (all < 70), set best_new_thread confidence high.
- NEVER suggest creating a new thread that closely resembles a suppressed thread. If the email would naturally belong to a suppressed thread topic, leave it unthreaded by returning empty top_matches and a best_new_thread with confidence 0.`;

    const text = await generate(prompt, 'lite');

    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err) {
        console.error('❌ Failed to parse thread assignment:', text);
        return { top_matches: [], best_new_thread: { title: email.subject, category: 'other', confidence: 100 } };
    }
}

/**
 * Score a list of unthreaded emails against a specific thread.
 * Returns the emails ranked by relevance.
 */
async function scoreEmailsForThread(thread, candidateEmails) {
    if (candidateEmails.length === 0) return [];

    const threadContext = {
        title: thread.title,
        category: thread.category,
        memory: thread.memory_bank ? (typeof thread.memory_bank === 'string' ? JSON.parse(thread.memory_bank) : thread.memory_bank) : {},
    };

    const emailList = candidateEmails.map(e => ({
        id: e.id,
        from: e.from_email,
        subject: e.subject,
        snippet: e.snippet,
    }));

    const prompt = `You are an email threading assistant. Given this thread and a list of unassigned emails, score how relevant each email is to this thread.

THREAD:
${JSON.stringify(threadContext, null, 2)}

CANDIDATE EMAILS:
${JSON.stringify(emailList, null, 2)}

Return a JSON array of objects:
[
  { "id": email_id, "confidence": 0-100 }
]

Only include emails with confidence >= 20. Sort by confidence descending. Maximum 10 results.`;

    const text = await generate(prompt, 'lite');

    try {
        const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('❌ Failed to parse email scoring:', text);
        return [];
    }
}

/**
 * Stage 2b: Extract/update thread memory bank from a new email.
 */
async function extractThreadMemory(currentMemory, newEmail) {
    const prompt = `Given an email thread's current memory and a new email, extract and update key information.

CURRENT MEMORY:
${JSON.stringify(currentMemory || {}, null, 2)}

NEW EMAIL:
From: ${newEmail.from_email}
Subject: ${newEmail.subject}
Date: ${newEmail.received_at}
Body: ${(newEmail.body || '').slice(0, 1500)}

Return an updated JSON memory bank with these fields:
{
  "people": [{"name": "...", "email": "...", "role": "..."}],
  "topics": ["topic1", "topic2"],
  "action_items": ["item1", "item2"],
  "key_dates": [{"date": "...", "description": "..."}],
  "status": "brief current status"
}

Merge new information with existing. Remove outdated items. Keep it concise.`;

    const text = await generate(prompt, 'mid');

    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err) {
        console.error('❌ Failed to parse memory extraction:', text);
        return currentMemory || {};
    }
}

/**
 * Stage 2c: Generate a summary for a thread.
 */
async function generateSummary(thread, emails) {
    const emailTexts = emails.map(e =>
        `From: ${e.from_email}\nDate: ${e.received_at}\nSubject: ${e.subject}\n${(e.snippet || '').slice(0, 300)}`
    ).join('\n---\n');

    const prompt = `Summarize this email thread concisely.

THREAD: ${thread.title}
MEMORY: ${JSON.stringify(thread.memory_bank || {}, null, 2)}

EMAILS (${emails.length} total, chronological):
${emailTexts}

Return JSON:
{
  "tldr": "2-3 sentence summary",
  "action_items": ["specific action 1", "specific action 2"],
  "key_people": [{"name": "...", "role": "..."}],
  "status": "one sentence current status"
}`;

    const text = await generate(prompt, 'pro');

    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err) {
        console.error('❌ Failed to parse summary:', text);
        return { tldr: 'Summary generation failed', action_items: [], key_people: [], status: 'Unknown' };
    }
}

/**
 * Generate a triage rule from user reasoning.
 */
async function generateTriageRule(email, desiredCategory, userReasoning, existingRules = []) {
    const existingRulesText = existingRules.length > 0
        ? `\nEXISTING RULES (consider how the new rule interacts with these):
${existingRules.map(r => `ID: ${r.id} | "${r.sender_pattern}" → ${r.category} (${r.reason})`).join('\n')}`
        : '';

    const prompt = `You are a triage rule assistant. A user wants to create a new email classification rule.

EMAIL THAT TRIGGERED THIS:
From: ${email.from_email}
Subject: ${email.subject}
Snippet: ${email.snippet}

USER WANTS TO CLASSIFY AS: ${desiredCategory}
USER'S REASONING: "${userReasoning}"
${existingRulesText}

Based on the user's reasoning, create a smart, reusable rule, AND check if it conflicts with existing rules.
CRITICAL INSTRUCTIONS FOR PREVENTING OVERLAP:
- If your new rule conflicts with an existing rule (e.g., existing says sender A is junk, but new says sender A is important if it contains X), YOU MUST return an updated version of the existing rule along with the new rule so they are mutually exclusive (e.g., add an exception to the old rule: "sender A is junk UNLESS it contains X").
- If no conflicts exist, just return the new rule.

Return a JSON array of rule objects (at least one for the new rule, plus any existing rules you need to update to prevent overlap):
[
  {
    "id": 123, // MUST include the existing rule's ID if you are modifying an existing rule. Omit "id" or set to null for the brand new rule.
    "sender_pattern": "domain or email pattern (e.g. 'aliexpress.com')",
    "subject_pattern": "optional subject keyword pattern (null if not relevant)",
    "category": "${desiredCategory}", // (or the original category if modifying an existing rule)
    "reason": "clear, concise rule description",
    "explanation": "brief explanation of why this rule exists or how it was modified"
  }
]`;

    const text = await generate(prompt, 'lite');

    try {
        const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch (err) {
        console.error('❌ Failed to parse rule generation:', text);
        return [{
            sender_pattern: (email.from_email || '').match(/@([^>\s]+)/)?.[1] || email.from_email,
            subject_pattern: null,
            category: desiredCategory,
            reason: userReasoning,
            explanation: 'Auto-generated from user override',
        }];
    }
}

/**
 * Generate a conversational briefing of unread important emails.
 */
async function generateBriefing(emails, tone = 'concise') {
    if (emails.length === 0) return { message: "No new emails to brief you on. You're all caught up! 🎉", emails: [] };

    const emailList = emails.map(e => ({
        id: e.id,
        from: e.from_email,
        subject: e.subject,
        snippet: e.snippet,
        body: (e.body || '').slice(0, 500),
        date: e.received_at,
    }));

    const prompt = `You are a personal email assistant briefing the user on their unread emails.

TONE: ${tone} (adjust verbosity accordingly — "concise" means short phrases/dot points, "detailed" means full sentences, "casual" means friendly and informal)

EMAILS:
${JSON.stringify(emailList, null, 2)}

For each email, provide:
- A brief summary (dot points, short phrases preferred unless tone says otherwise)
- Flag any urgent issues or deadlines
- Extract any questions or decisions the user needs to make
- Note if a reply is expected

Return JSON:
{
  "greeting": "brief contextual greeting (e.g. 'You have 3 new emails')",
  "emails": [
    {
      "id": number,
      "from_name": "sender's name/org",
      "summary": "brief summary",
      "urgency": "none" | "low" | "medium" | "high",
      "needs_reply": true/false,
      "questions": ["question or decision needed"],
      "key_info": ["important detail 1", "important detail 2"]
    }
  ]
}`;

    const text = await generate(prompt, 'mid');

    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err) {
        console.error('❌ Failed to parse briefing:', text);
        return { greeting: `You have ${emails.length} new email(s).`, emails: [] };
    }
}

/**
 * Generate a reply draft for an email based on user instructions.
 */
async function generateReplyDraft(email, userInstructions, tone = 'concise') {
    const prompt = `Draft a reply to this email based on the user's instructions.

ORIGINAL EMAIL:
From: ${email.from_email}
Subject: ${email.subject}
Body:
${(email.body || email.snippet || '').slice(0, 2000)}

USER'S INSTRUCTIONS: "${userInstructions}"

TONE: ${tone} — match the formality of the original sender. If they're casual, be casual. If formal, be formal. Stay succinct unless the user asks for detail.

Return JSON:
{
  "subject": "Re: original subject (or adjusted if needed)",
  "body": "the full reply text (plain text, no HTML)",
  "notes": "optional brief note about the draft (e.g. 'kept it brief since they seem busy')"
}`;

    const text = await generate(prompt, 'pro');

    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (err) {
        console.error('❌ Failed to parse draft:', text);
        return { subject: `Re: ${email.subject}`, body: userInstructions, notes: 'Auto-generated fallback' };
    }
}

/**
 * Process a user message in the chat conversation context.
 * Determines intent and returns an appropriate response.
 */
async function chatRespond(conversationHistory, userMessage, currentEmailContext, briefedEmails = [], tone = 'concise') {
    const prompt = `You are the AI assistant built into the "EMail-AI-Laundry" app. You have memory of the full conversation. Process the user's message in context of the conversation history.

ABOUT THIS APP:
- This app manages emails from Gmail and Outlook accounts.
- AI Triage: when the user clicks "Analyze", emails are classified by AI as regular, junk, spam, or for_review. Users can override classifications and teach the AI via triage rules.
- AI Semantic Threading: regular emails are grouped into semantic threads by AI based on topic similarity — NOT traditional reply chains. The AI looks at subject, sender, body content, and context to decide which thread an email belongs to (or creates a new one).
- Triage Rules: pattern-based rules (sender pattern + optional subject pattern → category) that override AI classification. Users can create them manually or via this chat.
- Thread Suppression: users can delete unwanted threads and suppress similar ones from being recreated. Suppressed thread patterns are remembered.
- You can help users manage their inbox: triage emails, suggest rules, answer questions about how the app works, and draft replies.
- When answering questions about features like threading, triage, or rules, answer in the context of THIS app's AI-powered features, not generic email clients.

CONVERSATION SO FAR:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

USER'S NEW MESSAGE: "${userMessage}"

${currentEmailContext ? `CURRENT EMAIL CONTEXT:\nID: ${currentEmailContext.id}\nFrom: ${currentEmailContext.from_email}\nSubject: ${currentEmailContext.subject}\nBody: ${(currentEmailContext.body || '').slice(0, 1000)}` : 'No specific email in focus.'}

${briefedEmails.length > 0 ? `RECENTLY BRIEFED EMAILS:\n${briefedEmails.map(e => `ID: ${e.id} | From: ${e.from_email} | Subject: ${e.subject}`).join('\n')}` : ''}

TONE: ${tone}

IMPORTANT: You are in a multi-turn conversation. The user can respond to your previous messages. Pay close attention to the conversation history to understand what the user is referring to. If you previously asked the user a yes/no question (like "would you like to create a rule?"), their response ("yes", "no", "sure", "nah", etc.) is answering YOUR question.

Determine what the user wants and respond appropriately. Possible intents:
1. "answer" — They're answering a question about an email. Extract their answer and prepare to draft a reply.
2. "edit_draft" — They want changes to a previously shown draft. Note their critique.
3. "skip" — They want to skip this email and move on.
4. "triage" — They want to move/junk one or more emails. When the user says "delete" or "get rid of" an email, treat it as moving to junk (NOT permanently deleting). Only use category "junk".
5. "suggest_rule" — The user expressed a strong preference about a sender or type of email (e.g. "I hate emails from X", "always junk newsletters", "stop showing me Y"). Ask the user if they'd like to create a rule, and include the sender pattern and category in your response. Do NOT create the rule yet — just propose it and wait for confirmation.
6. "confirm_rule" — The user confirmed a previously proposed rule (said "yes", "sure", "do it", etc. in response to your rule suggestion). Include the same suggested_rule object from your previous proposal so the system can create it.
7. "question" — They're asking you a question about an email or the briefing.
8. "general" — General conversation not about a specific email.

Return JSON:
{
  "intent": "answer" | "edit_draft" | "skip" | "triage" | "question" | "general" | "suggest_rule" | "confirm_rule",
  "response": "your conversational response to the user",
  "should_draft": true/false (true if you should generate a reply draft next),
  "draft_instructions": "if should_draft is true, summarized instructions for the draft based on user's message",
  "target_email_id": number or null (the ID of the email the user is referring to — MUST be set if should_draft is true),
  "triage_category": "junk" (only if intent is triage),
  "triage_email_ids": [number] (array of email IDs to triage, only if intent is triage),
  "suggested_rule": { "sender_pattern": "...", "subject_pattern": "...", "category": "junk", "reason": "..." } (include if intent is suggest_rule OR confirm_rule)
}`;

    const text = await generate(prompt, 'mid');

    try {
        const parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
        return parsed;
    } catch (err) {
        console.error('❌ Failed to parse chat response:', text);
        return { intent: 'general', response: "I didn't quite catch that. Could you rephrase?", should_draft: false };
    }
}

module.exports = {
    triageEmails,
    assignEmailToThread,
    scoreEmailsForThread,
    extractThreadMemory,
    generateSummary,
    generateTriageRule,
    generateBriefing,
    generateReplyDraft,
    chatRespond,
};
