const ai = require('./ai');
const db = require('../db/database');
const { deductUserCredits, CREDIT_COSTS } = require('../middleware/credits');

/**
 * Stage 1 ONLY: Triage unprocessed emails.
 * Does NOT thread or summarize — that happens after user confirms triage.
 * @param {function} onProgress - Optional callback for progress updates: (message: string) => void
 */
async function triageNewEmails(onProgress) {
    const emit = onProgress || (() => {});
    const stats = { triaged: 0, junk: 0, spam: 0, forReview: 0, regular: 0, errors: [] };

    emit('🔍 Starting triage...');
    console.log('🔍 Triaging unprocessed emails...');
    const untriaged = await db.getUntriaged();

    if (untriaged.length === 0) {
        emit('No new emails to triage.');
        console.log('   No new emails to triage.');
    } else {
        emit(`🔍 Triaging ${untriaged.length} emails...`);
        console.log(`   Found ${untriaged.length} untriaged emails`);

        try {
            const triageRules = await db.getTriageRules('active');
            const gmailAccountType = await db.getSetting('gmail_account_type') || await db.getSetting('account_type') || 'personal';
            const outlookAccountType = await db.getSetting('outlook_account_type') || 'personal';

            if (triageRules.length > 0) {
                console.log(`   📚 Using ${triageRules.length} learned triage rules`);
            }

            const emailsWithContext = untriaged.map(e => ({
                ...e,
                _accountType: (e.provider === 'outlook') ? outlookAccountType : gmailAccountType,
            }));

            const triageResults = await ai.triageEmails(emailsWithContext, triageRules, gmailAccountType);

            for (const result of triageResults) {
                try {
                    await db.updateTriageResult(result.id, result.category, result.reason, result.confidence);
                    stats.triaged++;
                    if (result.category === 'junk') stats.junk++;
                    else if (result.category === 'spam') stats.spam++;
                    else if (result.category === 'for_review') stats.forReview++;
                    else if (result.category === 'regular') stats.regular++;
                } catch (err) {
                    stats.errors.push(`Triage save failed for email ${result.id}: ${err.message}`);
                }
            }

            emit(`✅ Triaged ${stats.triaged} emails: ${stats.regular} regular, ${stats.junk + stats.spam} junk`);
            console.log(`   ✅ Triaged ${stats.triaged} emails: ${stats.regular} regular, ${stats.junk} junk, ${stats.spam} spam, ${stats.forReview} for review`);
        } catch (err) {
            stats.errors.push(`Triage batch failed: ${err.message}`);
            console.error('   ❌ Triage failed:', err.message);
            emit(`❌ Triage failed: ${err.message}`);
        }
    }

    const msg = `🎉 Triage complete! ${stats.triaged} emails triaged.`;
    emit(msg);
    console.log(`\n${msg}`);
    if (stats.errors.length > 0) {
        console.log(`⚠️  ${stats.errors.length} errors occurred.`);
    }

    return stats;
}

/**
 * Stage 2 + 3: Thread confirmed regular emails and generate summaries.
 * Called AFTER user confirms triage (junk emails already moved out).
 * @param {function} onProgress - Optional callback for progress updates
 * @param {string} userEmail - User email for usage tracking
 */
async function threadConfirmedEmails(onProgress, userEmail) {
    const emit = onProgress || (() => {});
    const stats = { threaded: 0, errors: [] };
    const affectedThreadIds = new Set();

    // --- Stage 2: Threading (regular emails only) ---
    emit('🧵 Threading confirmed emails...');
    console.log('\n🧵 Threading confirmed regular emails...');
    const regularEmails = await db.getImportantUnthreaded();

    if (regularEmails.length === 0) {
        emit('No emails to thread.');
        console.log('   No regular emails to thread.');
    } else {
        emit(`🧵 Threading ${regularEmails.length} emails...`);
        console.log(`   Found ${regularEmails.length} regular emails to thread`);

        const suppressedThreads = await db.getSuppressedThreads();
        if (suppressedThreads.length > 0) {
            console.log(`   🚫 ${suppressedThreads.length} suppressed thread patterns loaded`);
        }

        for (let i = 0; i < regularEmails.length; i++) {
            const email = regularEmails[i];
            try {
                emit(`🧵 Threading ${i + 1}/${regularEmails.length}: "${(email.subject || '').slice(0, 40)}..."`);

                const currentThreads = await db.getThreads();
                const assignment = await ai.assignEmailToThread(email, currentThreads, suppressedThreads);
                await deductUserCredits(userEmail, CREDIT_COSTS.lite, 'lite');

                let threadId;
                let confidence = 0;
                const bestMatch = assignment.top_matches?.[0];
                const newThread = assignment.best_new_thread || {};

                // If AI returns confidence 0, this email matches a suppressed thread — skip it
                if (bestMatch && bestMatch.confidence >= 70) {
                    threadId = bestMatch.thread_id;
                    confidence = bestMatch.confidence;
                    console.log(`   📎 \"${email.subject}\" → existing thread #${threadId} (${confidence}%)`);
                } else if (newThread.confidence === 0) {
                    // Suppressed — mark as processed but don't thread
                    await db.assignEmailToThread(email.id, null, 0);
                    console.log(`   🚫 \"${email.subject}\" — matches suppressed thread, skipping`);
                    stats.threaded++;
                    continue;
                } else {
                    threadId = await db.createThread({
                        title: newThread.title || email.subject,
                        category: newThread.category || 'other',
                    });
                    confidence = newThread.confidence || 100;
                    console.log(`   🆕 \"${email.subject}\" → new thread #${threadId}: \"${newThread.title || email.subject}\"`);
                }

                await db.assignEmailToThread(email.id, threadId, confidence);
                affectedThreadIds.add(threadId);

                const thread = await db.getThreadWithEmails(threadId);
                const updatedMemory = await ai.extractThreadMemory(thread.memory_bank, email);
                await deductUserCredits(userEmail, CREDIT_COSTS.mid, 'mid');
                await db.updateThreadMemory(threadId, updatedMemory);

                stats.threaded++;
            } catch (err) {
                stats.errors.push(`Threading failed for "${email.subject}": ${err.message}`);
                console.error(`   ❌ Failed to thread "${email.subject}":`, err.message);
            }
        }
    }

    // --- Stage 3: Generate/update summaries for AFFECTED threads only ---
    const allThreads = await db.getThreads();
    const threadsToSummarize = affectedThreadIds.size > 0
        ? allThreads.filter(t => affectedThreadIds.has(t.id))
        : [];

    if (threadsToSummarize.length === 0) {
        emit('📝 No thread summaries to update.');
        console.log('\n📝 No threads changed — skipping summary generation.');
    } else {
        emit(`📝 Summarizing ${threadsToSummarize.length} changed threads...`);
        console.log(`\n📝 Generating summaries for ${threadsToSummarize.length} changed threads...`);

        for (let i = 0; i < threadsToSummarize.length; i++) {
            const thread = threadsToSummarize[i];
            try {
                emit(`📝 Summarizing ${i + 1}/${threadsToSummarize.length}: "${(thread.title || '').slice(0, 40)}..."`);
                const fullThread = await db.getThreadWithEmails(thread.id);
                if (!fullThread || fullThread.emails.length === 0) continue;

                const summary = await ai.generateSummary(fullThread, fullThread.emails);
                await deductUserCredits(userEmail, CREDIT_COSTS.pro, 'pro');
                await db.upsertThreadSummary(thread.id, summary);
                console.log(`   ✅ Summary for "${thread.title}"`);
            } catch (err) {
                stats.errors.push(`Summary failed for thread "${thread.title}": ${err.message}`);
                console.error(`   ❌ Summary failed for "${thread.title}":`, err.message);
            }
        }
    }

    const msg = `🎉 Done! ${stats.threaded} emails threaded.`;
    emit(msg);
    console.log(`\n${msg}`);
    if (stats.errors.length > 0) {
        console.log(`⚠️  ${stats.errors.length} errors occurred.`);
    }

    return stats;
}

module.exports = { triageNewEmails, threadConfirmedEmails };
