const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' || process.env.DATABASE_URL?.includes('neon.tech') || process.env.DATABASE_URL?.includes('supabase')
        ? { rejectUnauthorized: false }
        : false,
    });
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  await p.query(schema);
  await seedDefaults();
  console.log('✅ Database initialized (PostgreSQL)');
}

async function seedDefaults() {
  const p = getPool();
  const defaults = [
    ['junk_action', 'move_to_junk'],
    ['auto_apply_actions', 'false'],
    ['chat_tone', 'concise'],
    ['gmail_account_type', 'personal'],
    ['outlook_account_type', 'personal'],
  ];
  for (const [key, value] of defaults) {
    await p.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [key, value]
    );
  }
}

// --- Token operations (single-user MVP) ---

async function saveTokens({ access_token, refresh_token, expiry_date }) {
  const p = getPool();
  await p.query(`
    INSERT INTO tokens (id, access_token, refresh_token, expiry_date, updated_at)
    VALUES (1, $1, $2, $3, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = $1,
      refresh_token = COALESCE($2, tokens.refresh_token),
      expiry_date = $3,
      updated_at = NOW()
  `, [access_token, refresh_token, expiry_date]);
}

async function getTokens() {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM tokens WHERE id = 1');
  return rows[0] || null;
}

// --- Outlook Token operations ---

async function saveOutlookTokens({ access_token, refresh_token, expiry_date, email }) {
  const p = getPool();
  await p.query(`
    INSERT INTO outlook_tokens (id, access_token, refresh_token, expiry_date, email, updated_at)
    VALUES (1, $1, $2, $3, $4, NOW())
    ON CONFLICT (id) DO UPDATE SET
      access_token = $1,
      refresh_token = COALESCE($2, outlook_tokens.refresh_token),
      expiry_date = $3,
      email = COALESCE($4, outlook_tokens.email),
      updated_at = NOW()
  `, [access_token, refresh_token, expiry_date, email]);
}

async function getOutlookTokens() {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM outlook_tokens WHERE id = 1');
  return rows[0] || null;
}

async function deleteOutlookTokens() {
  const p = getPool();
  await p.query('DELETE FROM outlook_tokens WHERE id = 1');
}

// --- Email operations ---

async function upsertEmail({ gmail_id, thread_id, from_email, to_email, subject, body, snippet, received_at, gmail_spam = false, provider = 'gmail' }) {
  const p = getPool();
  await p.query(`
    INSERT INTO emails (gmail_id, thread_id, from_email, to_email, subject, body, snippet, received_at, gmail_spam, provider)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (gmail_id) DO UPDATE SET
      subject = EXCLUDED.subject,
      body = EXCLUDED.body,
      snippet = EXCLUDED.snippet,
      gmail_spam = EXCLUDED.gmail_spam,
      provider = EXCLUDED.provider
  `, [gmail_id, thread_id, from_email, to_email, subject, body, snippet, received_at, gmail_spam ? 1 : 0, provider]);
}

async function getAllEmails({ limit = 50, offset = 0 } = {}) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category NOT IN ('actioned', 'confirmed_junk')
    ORDER BY received_at DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);
  return rows;
}

async function getEmailCount() {
  const p = getPool();
  const { rows } = await p.query("SELECT COUNT(*) as count FROM emails WHERE triage_category NOT IN ('actioned', 'confirmed_junk')");
  return parseInt(rows[0].count);
}

async function getEmailById(emailId) {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM emails WHERE id = $1', [emailId]);
  return rows[0] || null;
}

// --- Triage operations ---

async function getUntriaged() {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT id, gmail_id, from_email, subject, snippet, received_at
    FROM emails
    WHERE triage_category = 'unprocessed'
    ORDER BY received_at DESC
  `);
  return rows;
}

async function updateTriageResult(emailId, category, reason, confidence) {
  const p = getPool();
  await p.query(`
    UPDATE emails SET triage_category = $1, triage_reason = $2, triage_confidence = $3, gmail_spam = 0 WHERE id = $4
  `, [category, reason, confidence || null, emailId]);
}

async function getEmailsByCategory(category, { limit = 50, offset = 0 } = {}) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category = $1
    ORDER BY received_at DESC
    LIMIT $2 OFFSET $3
  `, [category, limit, offset]);
  return rows;
}

async function getEmailsByCategoryCount(category) {
  const p = getPool();
  const { rows } = await p.query('SELECT COUNT(*) as count FROM emails WHERE triage_category = $1', [category]);
  return parseInt(rows[0].count);
}

async function markActionTaken(emailId) {
  const p = getPool();
  await p.query('UPDATE emails SET triage_action_taken = 1 WHERE id = $1', [emailId]);
}

async function getPendingActions(category) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category = $1 AND triage_action_taken = 0
    ORDER BY received_at DESC
  `, [category]);
  return rows;
}

// --- Semantic thread operations ---

async function createThread({ title, category, memoryBank }) {
  const p = getPool();
  const { rows } = await p.query(`
    INSERT INTO semantic_threads (title, category, memory_bank, last_activity)
    VALUES ($1, $2, $3, NOW())
    RETURNING id
  `, [title, category, JSON.stringify(memoryBank || {})]);
  return rows[0].id;
}

async function updateThreadMemory(threadId, memoryBank) {
  const p = getPool();
  await p.query(`
    UPDATE semantic_threads
    SET memory_bank = $1, last_activity = NOW()
    WHERE id = $2
  `, [JSON.stringify(memoryBank), threadId]);
}

async function assignEmailToThread(emailId, semanticThreadId, confidence) {
  const p = getPool();
  await p.query(`
    UPDATE emails
    SET semantic_thread_id = $1, processed = 1, thread_confidence = $2
    WHERE id = $3
  `, [semanticThreadId, confidence || null, emailId]);
}

async function getThreads() {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT
      st.*,
      COUNT(e.id) as email_count,
      ts.tldr,
      ts.status as thread_status,
      STRING_AGG(DISTINCT e.provider, ',') as providers
    FROM semantic_threads st
    LEFT JOIN emails e ON e.semantic_thread_id = st.id
    LEFT JOIN thread_summaries ts ON ts.thread_id = st.id
    GROUP BY st.id, ts.tldr, ts.status
    ORDER BY st.last_activity DESC
  `);
  // Convert email_count from string to number
  return rows.map(r => ({ ...r, email_count: parseInt(r.email_count) }));
}

async function getThreadWithEmails(threadId) {
  const p = getPool();
  const { rows: threadRows } = await p.query('SELECT * FROM semantic_threads WHERE id = $1', [threadId]);
  const thread = threadRows[0];
  if (!thread) return null;

  const { rows: emails } = await p.query(`
    SELECT * FROM emails
    WHERE semantic_thread_id = $1
    ORDER BY received_at ASC
  `, [threadId]);

  const { rows: summaryRows } = await p.query('SELECT * FROM thread_summaries WHERE thread_id = $1', [threadId]);
  const summary = summaryRows[0] || null;

  return {
    ...thread,
    memory_bank: thread.memory_bank ? JSON.parse(thread.memory_bank) : {},
    emails,
    summary,
  };
}

async function getImportantUnthreaded() {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category = 'regular' AND (semantic_thread_id IS NULL OR processed = 0)
      AND thread_excluded = 0
    ORDER BY received_at ASC
  `);
  return rows;
}

async function getUnthreadedEmails(limit = 50) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE semantic_thread_id IS NULL AND triage_category = 'regular'
      AND thread_excluded = 0
    ORDER BY received_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function getAllRegularEmails(limit = 100) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category IN ('regular', 'unprocessed')
    ORDER BY received_at DESC
    LIMIT $1
  `, [limit]);
  return rows;
}

async function getThreadedRegularEmails() {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category = 'regular' AND semantic_thread_id IS NOT NULL AND processed = 1
    ORDER BY received_at ASC
  `);
  return rows;
}

async function removeEmailFromThread(emailId) {
  const p = getPool();
  await p.query(`
    UPDATE emails
    SET semantic_thread_id = NULL, processed = 0, thread_confidence = NULL
    WHERE id = $1
  `, [emailId]);
}

async function deleteThread(threadId) {
  const p = getPool();

  // Grab thread info + senders before deleting, for suppression
  const { rows: threadRows } = await p.query('SELECT * FROM semantic_threads WHERE id = $1', [threadId]);
  const thread = threadRows[0];
  const { rows: senderRows } = await p.query(
    'SELECT DISTINCT from_email FROM emails WHERE semantic_thread_id = $1', [threadId]
  );
  const senders = senderRows.map(r => r.from_email).filter(Boolean);

  // Mark emails as excluded from future threading
  await p.query(`
    UPDATE emails
    SET semantic_thread_id = NULL, processed = 1, thread_confidence = NULL, thread_excluded = 1
    WHERE semantic_thread_id = $1
  `, [threadId]);

  // Store suppression pattern
  if (thread) {
    await p.query(`
      INSERT INTO suppressed_threads (title, category, senders, reason)
      VALUES ($1, $2, $3, $4)
    `, [thread.title, thread.category, senders.join(', '), 'User deleted thread']);
    console.log(`🚫 Suppressed thread pattern: "${thread.title}" (${senders.length} senders)`);
  }

  // Delete summary and thread
  await p.query('DELETE FROM thread_summaries WHERE thread_id = $1', [threadId]);
  await p.query('DELETE FROM semantic_threads WHERE id = $1', [threadId]);
}

// --- Suppressed threads ---

async function getSuppressedThreads() {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM suppressed_threads ORDER BY created_at DESC');
  return rows;
}

// --- Thread summary operations ---

async function upsertThreadSummary(threadId, { tldr, action_items, key_people, status }) {
  const p = getPool();
  await p.query(`
    INSERT INTO thread_summaries (thread_id, tldr, action_items, key_people, status, created_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (thread_id) DO UPDATE SET
      tldr = $2, action_items = $3, key_people = $4, status = $5, created_at = NOW()
  `, [threadId, tldr, JSON.stringify(action_items), JSON.stringify(key_people), status]);
}

// --- Settings operations ---

async function getSetting(key) {
  const p = getPool();
  const { rows } = await p.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value || null;
}

async function setSetting(key, value) {
  const p = getPool();
  await p.query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  );
}

async function getAllSettings() {
  const p = getPool();
  const { rows } = await p.query('SELECT * FROM settings');
  const settings = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

// --- Triage rules ---

async function addTriageRule({ sender_pattern, subject_pattern, category, reason, status = 'active' }) {
  const p = getPool();
  // Avoid duplicate rules for same sender+category+status
  const { rows: existing } = await p.query(
    'SELECT id FROM triage_rules WHERE sender_pattern = $1 AND category = $2 AND status = $3',
    [sender_pattern, category, status]
  );
  if (existing.length > 0) return existing[0].id;

  const { rows } = await p.query(`
    INSERT INTO triage_rules (sender_pattern, subject_pattern, category, reason, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [sender_pattern, subject_pattern, category, reason, status]);
  return rows[0].id;
}

async function getTriageRules(status = null) {
  const p = getPool();
  if (status) {
    const { rows } = await p.query('SELECT * FROM triage_rules WHERE status = $1 ORDER BY created_at DESC', [status]);
    return rows;
  }
  const { rows } = await p.query('SELECT * FROM triage_rules ORDER BY status ASC, created_at DESC');
  return rows;
}

async function deleteTriageRule(ruleId) {
  const p = getPool();
  await p.query('DELETE FROM triage_rules WHERE id = $1', [ruleId]);
}

async function approveSuggestedRule(ruleId) {
  const p = getPool();
  await p.query("UPDATE triage_rules SET status = 'active' WHERE id = $1", [ruleId]);
}

async function updateTriageRuleDef(id, { sender_pattern, subject_pattern, category, reason }) {
  const p = getPool();
  await p.query(`
    UPDATE triage_rules
    SET sender_pattern = $1, subject_pattern = $2, category = $3, reason = $4
    WHERE id = $5
  `, [sender_pattern, subject_pattern, category, reason, id]);
}

async function getFilterCountBySender(senderDomain) {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT COUNT(*) as count FROM emails
    WHERE triage_category IN ('junk', 'spam', 'confirmed_junk')
    AND triage_reason = 'Manual override by user'
    AND from_email LIKE $1
  `, [`%${senderDomain}%`]);
  return parseInt(rows[0]?.count || 0);
}

// --- Chat operations ---

async function getUnbriefedEmails() {
  const p = getPool();
  const { rows } = await p.query(`
    SELECT * FROM emails
    WHERE triage_category = 'important' AND chat_briefed = 0
    ORDER BY received_at DESC
  `);
  return rows;
}

async function markAsBriefed(emailIds) {
  if (!emailIds || emailIds.length === 0) return;
  const p = getPool();
  // Use ANY($1) for array parameter
  await p.query('UPDATE emails SET chat_briefed = 1 WHERE id = ANY($1)', [emailIds]);
}

async function bulkUpdateTriageCategories(updates) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const item of updates) {
      await client.query(
        'UPDATE emails SET triage_category = $1, triage_reason = $2, triage_confidence = NULL WHERE id = $3',
        [item.category, item.reason || null, item.id]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- User & credit operations ---

async function getOrCreateUser(email) {
  if (!email) return null;
  const p = getPool();

  const { rows } = await p.query('SELECT * FROM users WHERE email = $1', [email]);
  let user = rows[0];

  if (!user) {
    const { rows: newRows } = await p.query(`
      INSERT INTO users (email, credits_used, lite_calls, mid_calls, pro_calls, period_start, last_login)
      VALUES ($1, 0, 0, 0, 0, date_trunc('month', NOW()), NOW())
      RETURNING *
    `, [email]);
    user = newRows[0];
    console.log(`👤 New user registered: ${email}`);
  } else {
    // Reset usage if new month
    const periodStart = new Date(user.period_start);
    const now = new Date();
    if (periodStart.getFullYear() !== now.getFullYear() || periodStart.getMonth() !== now.getMonth()) {
      await p.query(`
        UPDATE users SET credits_used = 0, lite_calls = 0, mid_calls = 0, pro_calls = 0,
        period_start = date_trunc('month', NOW()), last_login = NOW()
        WHERE email = $1
      `, [email]);
      user.credits_used = 0;
      user.lite_calls = 0;
      user.mid_calls = 0;
      user.pro_calls = 0;
    } else {
      await p.query("UPDATE users SET last_login = NOW() WHERE email = $1", [email]);
    }
  }

  return user;
}

async function deductCredits(email, amount, tier) {
  if (!email || amount <= 0) return;
  const p = getPool();
  const tierCol = tier === 'pro' ? 'pro_calls' : tier === 'mid' ? 'mid_calls' : 'lite_calls';
  await p.query(
    `UPDATE users SET credits_used = credits_used + $1, ${tierCol} = ${tierCol} + 1 WHERE email = $2`,
    [amount, email]
  );
}

async function getUserCredits(email) {
  if (!email) return null;
  const p = getPool();
  const { rows } = await p.query(
    'SELECT credits_used, lite_calls, mid_calls, pro_calls, period_start FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];
  if (!user) return null;

  return {
    credits_used: user.credits_used,
    lite_calls: user.lite_calls,
    mid_calls: user.mid_calls,
    pro_calls: user.pro_calls,
    period_start: user.period_start,
  };
}

// --- Direct query helper (for one-off queries in routes) ---

async function query(text, params) {
  const p = getPool();
  const { rows } = await p.query(text, params);
  return rows;
}

module.exports = {
  initDb,
  getPool,
  query,
  saveTokens,
  getTokens,
  upsertEmail,
  getAllEmails,
  getEmailCount,
  getEmailById,
  // Triage
  getUntriaged,
  updateTriageResult,
  getEmailsByCategory,
  getEmailsByCategoryCount,
  markActionTaken,
  getPendingActions,
  // Triage rules
  addTriageRule,
  getTriageRules,
  deleteTriageRule,
  approveSuggestedRule,
  updateTriageRuleDef,
  getFilterCountBySender,
  bulkUpdateTriageCategories,
  // Threads
  createThread,
  updateThreadMemory,
  assignEmailToThread,
  getThreads,
  getThreadWithEmails,
  getImportantUnthreaded,
  getUnthreadedEmails,
  getAllRegularEmails,
  getThreadedRegularEmails,
  removeEmailFromThread,
  deleteThread,
  getSuppressedThreads,
  // Summaries
  upsertThreadSummary,
  // Settings
  getSetting,
  setSetting,
  getAllSettings,
  // Chat
  getUnbriefedEmails,
  markAsBriefed,
  // Outlook tokens
  saveOutlookTokens,
  getOutlookTokens,
  deleteOutlookTokens,
  // Users & credits
  getOrCreateUser,
  deductCredits,
  getUserCredits,
};
