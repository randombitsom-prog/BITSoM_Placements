# BITSoM Placements – PlacementStats

PlacementStats is BITSoM's placement copilot: a Next.js web app that blends a live dashboard, job-postings explorer, and AI assistant grounded in internal RAG data (Google Sheet stats, Skynet postings, interview transcripts, LinkedIn alumni). It is deployed at [bitsom-placements.vercel.app](https://bitsom-placements.vercel.app/).

---

## Table of Contents
1. [Live Experience](#live-experience)
2. [Feature Overview](#feature-overview)
3. [Architecture](#architecture)
4. [Data Sources & Ingestion](#data-sources--ingestion)
5. [Getting Started](#getting-started)
6. [Configuration](#configuration)
7. [Deployment](#deployment)
8. [Contact](#contact)

---

## Live Experience

- **URL:** https://bitsom-placements.vercel.app/
- **Demo Login:** any email + any password (session stored in `sessionStorage`)
- **GitHub:** this repository

---

## Feature Overview

| Surface | Highlights |
| ------- | ---------- |
| **Placement Dashboard** | Real-time PPO/off-campus stats, cluster/day breakdowns, highest/average CTC, offer distributions, and a searchable company-offer table fueled by the live Google Sheet. |
| **Job Postings Explorer** | `/job-postings` + `/api/placements` show open/closed roles with role, location, deadlines, description, and “open” status. |
| **PlacementStats Chat** | Streaming SSE chat with quick prompts (KPMG transcripts, job postings, J.P. Morgan alumni), markdown link support, expand-to-90%-viewport modal, and alumni-aware behavior. |
| **LinkedIn Alumni Discovery** | Pinecone `linkedin_profiles` namespace stores curated alumni (name, role, class year, LinkedIn URL). Replies append top matches when “alum/alumni” is detected. |
| **Interview Transcript RAG** | Pinecone `transcripts` namespace contains 38 cleaned transcripts (company, interviewee, Q&A chunks) for prep. |
| **Moderation & Guardrails** | OpenAI moderation + custom prompt guardrails keep the AI safe and on-topic. |
| **Login Gate** | Dummy auth keeps the experience limited to the BITSoM community; swap with SSO for production. |

---

## Architecture

```
Next.js 14 (App Router)
│
├── Frontend
│   ├── /            -> redirects to /login
│   ├── /login       -> modal + form (sessionStorage auth)
│   ├── /dashboard   -> stats, chatbot panel, release notes
│   ├── /job-postings-> card grid powered by /api/placements
│   └── components/dashboard/ChatBot.tsx (SSE chat widget)
│
├── API Routes
│   ├── /api/chat        -> streamText with Pinecone + Exa tools
│   └── /api/placements  -> job listings from Pinecone `placements`
│
├── Lib
│   ├── pinecone.ts  -> multi-namespace search, job parsing helpers
│   └── moderation.ts-> OpenAI moderation helper
│
└── Scripts (Python)
    ├── ingest_linkedin_profiles_to_pinecone.py
    ├── ingest_transcripts.py
    └── download_public_sheet.py (plus others)
```

### RAG Flow
1. `/api/chat` receives a user query, runs moderation.
2. It queries Pinecone namespaces (`placements`, `placement_stats`, `transcripts`, `linkedin_profiles`). We flag `<alumni_query>` when the user mentions “alum/alumni”.
3. The resulting contexts are injected into the system prompt along with instructions; Exa web search is invoked only when Pinecone has no relevant data.
4. Responses stream back via the `ai` SDK; the chat UI renders markdown and quick actions.

---

## Data Sources & Ingestion

| Namespace | Source | Script / Notes |
|-----------|--------|----------------|
| `placements` | Skynet placement portal | Scraped & parsed job postings with metadata (company, role, cluster/day, compensation, deadlines). |
| `placement_stats` | Internal CSV / Sheet | Per-student placement summaries (name, YOE, status, company, CTC). |
| `transcripts` | Interview PDFs | `scripts/ingest_transcripts.py` cleans OCR text, chunks, uploads to Pinecone. |
| `linkedin_profiles` | ~200 BITSoM alumni | `scripts/ingest_linkedin_profiles_to_pinecone.py` (Selenium + cleanup). Stores LinkedIn URL, current role, past companies. |
| Google Sheet | Live stats for dashboard | `NEXT_PUBLIC_BITSOM_SHEET_ID`, fetched via gviz JSON endpoint in `app/dashboard/page.tsx`. |

> For production, ingestion would run on a schedule; for the capstone we performed one-off loads.

---

## Getting Started

```bash
pnpm install            # or npm install
cp env.template .env.local
# fill in env vars
pnpm dev
```

### Required `.env.local`
```
OPENAI_API_KEY=
EXA_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_NAME=ipcs
NEXT_PUBLIC_BITSOM_SHEET_ID=1sNESQWi2MQlIXuJ99zshKkFGw3bIoG7IgbYizqaaRIo
```

---

## Configuration

- `config.ts`: AI identity, moderation copy, Pinecone settings, OpenAI model.
- `prompts.ts`: Identity, tone, guardrails, tool priority, `<alumni_query>` logic, `<linkedin_profiles_context>` instructions, date/time tag.
- `lib/pinecone.ts`: Namespace queries, job listing parser, LinkedIn profile formatting.
- `components/dashboard/ChatBot.tsx`: Streaming UI, quick actions, markdown renderer.
- `app/page.tsx`: Redirects root to `/login`.

---

## Deployment

1. Connect repo to Vercel.
2. Add env vars in Vercel dashboard.
3. Deploy. Root URL always redirects to `/login`; after login, a session flag (in `sessionStorage`) keeps the user on `/dashboard` until the tab closes.

---

## Contact

Built by BITSoM IPCS students. For questions or contributions, open an issue or reach out to the placement committee.

---

**License:** MIT (see `LICENSE`).

