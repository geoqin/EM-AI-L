# EMail-AI-Laundry

AI-powered email triage, threading, and summarization. Connects to Gmail and Outlook, sorts your inbox into actionable threads, and lets you chat with an AI assistant about your emails.

**Self-hosted** — you bring your own API keys and run everything locally. Your emails never leave your machine.

## Features

- **Smart triage** — AI categorizes emails as regular, junk, spam, or needs-review
- **Semantic threading** — groups related emails into conversation threads with memory
- **AI summaries** — TL;DR, action items, key people for each thread
- **Chat assistant** — ask questions about your inbox, draft replies, create triage rules
- **Multi-provider** — Gmail + Outlook side by side
- **Usage tracking** — monitor your AI API usage with estimated dollar costs
- **Learned rules** — the AI suggests triage rules from your patterns

## Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **PostgreSQL** 14+ ([download](https://www.postgresql.org/download/) or `brew install postgresql@17`)
- **Google Cloud** account (free) for Gmail OAuth + Gemini API
- **Azure** account (free, optional) for Outlook OAuth

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/EM-AI-L.git
cd EM-AI-L

cd backend && npm install
cd ../frontend && npm install
```

### 2. Set up PostgreSQL

```bash
# Start PostgreSQL (macOS Homebrew)
brew services start postgresql@17

# Create the database
createdb email_ai
```

### 3. Get your API keys

#### Google OAuth (required for Gmail)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Go to **APIs & Services > OAuth consent screen**
   - Choose "External" user type
   - Fill in app name, support email
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add scope: `https://www.googleapis.com/auth/gmail.modify` (for sending)
   - Add your email as a test user
4. Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorized redirect URI: `http://localhost:3001/auth/google/callback`
   - Copy the **Client ID** and **Client Secret**

#### AI Provider (choose one)

The app supports multiple AI backends. Set `AI_PROVIDER` in your `.env` to one of:

| Provider | `AI_PROVIDER` | API Key Env Var | Free Tier? |
|----------|---------------|-----------------|------------|
| **Gemini** (default) | `gemini` | `GEMINI_API_KEY` | Yes — [get key](https://aistudio.google.com/apikey) |
| **Claude** (Anthropic) | `claude` | `ANTHROPIC_API_KEY` | No — [get key](https://console.anthropic.com) |
| **OpenAI** (GPT-4o) | `openai` | `OPENAI_API_KEY` | No — [get key](https://platform.openai.com/api-keys) |
| **Ollama** (local) | `ollama` | None (runs locally) | Yes — [install](https://ollama.com) then `ollama pull llama3.1` |

> Gemini is recommended for most users — Google provides a generous free tier.

#### Outlook OAuth (optional)

1. Go to [Azure Portal > App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps)
2. Click **New Registration**
   - Name: EMail-AI-Laundry
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: Web — `http://localhost:3001/auth/outlook/callback`
3. Copy the **Application (client) ID**
4. Go to **Certificates & secrets > New client secret** — copy the value

### 4. Configure environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your keys:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_key

GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3001/auth/google/callback
SESSION_SECRET=run_node_-e_"console.log(require('crypto').randomBytes(32).toString('hex'))"
DATABASE_URL=postgresql://localhost:5432/email_ai
FRONTEND_URL=http://localhost:5173
PORT=3001

# Optional — uncomment for Outlook
# OUTLOOK_CLIENT_ID=your_outlook_client_id
# OUTLOOK_CLIENT_SECRET=your_outlook_client_secret
# OUTLOOK_REDIRECT_URI=http://localhost:3001/auth/outlook/callback
```

### 5. Run

```bash
# Terminal 1 — backend
cd backend && npm start

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open http://localhost:5173 and sign in with Google.

## Architecture

```
frontend/          React + Vite + MUI
  src/
    components/    UI components (Dashboard, Chat, Threads, Settings, etc.)
    api/           API client wrapper

backend/           Express.js API
  routes/          auth, emails, threads, chat
  services/        ai (Gemini), gmail, outlook, thread-processor
  middleware/      usage tracking
  db/              PostgreSQL schema + database functions
```

### AI Model Tiers

| Tier | Credit Cost | Used For |
|------|-------------|----------|
| Lite (Flash) | 1 | Triage, thread assignment, rule matching |
| Mid (Flash/Pro) | 3 | Chat responses, memory extraction, briefings |
| Pro (Pro) | 5 | Thread summaries, email draft generation |

## Usage Tracking

The app tracks your AI API usage per month — visible in Settings. Each operation costs 1–5 credits depending on the model used. An estimated dollar cost is shown based on Gemini API list pricing.

> If you're using Google AI Studio's free tier, your actual cost is $0. The dollar estimate is shown for awareness if you switch to a paid plan.

## Notes

- **OAuth "Testing" mode**: Your Google Cloud app stays in testing mode (fine for personal use). Tokens expire every 7 days — just re-authenticate when prompted.
- **Data stays local**: All emails and AI-generated content are stored in your local PostgreSQL database. Nothing is sent to external servers except the Google/Microsoft/Gemini APIs.
- **Outlook is optional**: The app works with Gmail only. Outlook adds a second inbox if you want it.

## License

MIT
