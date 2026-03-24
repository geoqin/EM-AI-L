-- Tokens table (single-user MVP)
CREATE TABLE IF NOT EXISTS tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emails table (all columns inline — no runtime migrations)
CREATE TABLE IF NOT EXISTS emails (
  id SERIAL PRIMARY KEY,
  gmail_id TEXT UNIQUE NOT NULL,
  thread_id TEXT,
  from_email TEXT,
  to_email TEXT,
  subject TEXT,
  body TEXT,
  snippet TEXT,
  received_at TIMESTAMPTZ,
  processed INTEGER DEFAULT 0,
  triage_category TEXT DEFAULT 'unprocessed',
  triage_reason TEXT,
  triage_action_taken INTEGER DEFAULT 0,
  semantic_thread_id INTEGER,
  chat_briefed INTEGER DEFAULT 0,
  triage_confidence INTEGER,
  thread_confidence INTEGER,
  gmail_spam INTEGER DEFAULT 0,
  provider TEXT DEFAULT 'gmail',
  thread_excluded INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at);
CREATE INDEX IF NOT EXISTS idx_emails_triage ON emails(triage_category);
CREATE INDEX IF NOT EXISTS idx_emails_semantic_thread ON emails(semantic_thread_id);

-- AI-created semantic thread groups
CREATE TABLE IF NOT EXISTS semantic_threads (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  memory_bank TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ
);

-- AI-generated thread summaries
CREATE TABLE IF NOT EXISTS thread_summaries (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER UNIQUE REFERENCES semantic_threads(id),
  tldr TEXT,
  action_items TEXT,
  key_people TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User settings (single-user MVP)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Outlook tokens (secondary email provider)
CREATE TABLE IF NOT EXISTS outlook_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date BIGINT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Suppressed thread patterns (threads the user explicitly deleted/rejected)
CREATE TABLE IF NOT EXISTS suppressed_threads (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  senders TEXT,
  reason TEXT DEFAULT 'User deleted thread',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table (usage tracking only — no tiers or limits for self-hosted)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  credits_used INTEGER NOT NULL DEFAULT 0,
  lite_calls INTEGER NOT NULL DEFAULT 0,
  mid_calls INTEGER NOT NULL DEFAULT 0,
  pro_calls INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  last_login TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Triage rules (learned from user overrides + AI suggestions)
CREATE TABLE IF NOT EXISTS triage_rules (
  id SERIAL PRIMARY KEY,
  sender_pattern TEXT,
  subject_pattern TEXT,
  category TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
