# Phil — Web UI

A Next.js (App Router) + TypeScript + Tailwind chat interface for Phil the CISV
advisor. It streams answers token-by-token over SSE from the FastAPI backend
(`../api/server.py`), which uses a standalone Python RAG pipeline.

```
web/ (this app)  ──POST /api/chat──▶  api/server.py (FastAPI)
                 ◀──── SSE tokens ────   ├─ retrieve()  (Chroma + OpenAI embeddings)
                                         └─ providers.py (Mistral / Anthropic)
```

## Prerequisites

- The Chroma index must be built: from the repo root, `python -m rag.ingestion`.
- Backend dependencies installed (repo root): `pip install -r requirements.txt`.

## Run locally

**1. Backend** (from the repo root):

```bash
uvicorn api.server:app --reload --port 8000
```

**2. Frontend** (from `web/`):

```bash
npm install
cp .env.local.example .env.local   # points at http://localhost:8000
npm run dev
```

Open http://localhost:3000.

## Auth (Supabase)

`/login` signs users in with email + password via Supabase.

1. Copy the project URL and anon key from Supabase (Project Settings ▸ API) into
   `web/.env.local` as `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Under Authentication ▸ URL Configuration, set **Site URL** to the origin you
   actually browse (`http://localhost:3000` in dev, cookies
   are host-scoped) and add `http://localhost:3000/auth/confirm` plus the same
   path on your deployed domain to **Redirect URLs**.
3. Under Authentication ▸ Emails, edit **Confirm signup** to link to
   the token-hash route instead of the default `{{ .ConfirmationURL }}`:

   ```html
   <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
     Confirm your email
   </a>
   ```

   `app/auth/confirm/route.ts` calls `verifyOtp` with that hash. This is
   deliberately *not* the PKCE code flow: email links get opened in a different
   browser (or prefetched by a mail scanner) than the one that signed up, where
   the PKCE code-verifier cookie doesn't exist — which fails with "PKCE code
   verifier not found in storage".

Email sign-ups get a confirmation link (Supabase's default); the form says so
instead of logging the user straight in. Turn confirmation off in the dashboard
if you'd rather sign people in immediately.

## Conversations

Apply `../supabase/schema.sql` in the Supabase dashboard (SQL Editor → New query)
before first use. It creates `conversations` and `messages`, with Row Level
Security scoping every row to `auth.uid()` - that's what makes it safe for the
browser to read and write them directly with the user's own session.

On load, `Chat.tsx` resumes the user's most recent conversation; a new one is
created lazily on the first question, so opening the app doesn't leave empty
rows. Prior turns are sent to the backend with each question (`lib/api.ts`), so
the backend keeps no session state and reloads no longer start a fresh thread.

`session.ts` supports three user status: logged in, signed out, and undefined. Users can prompt Phil when signed out but the conversation is not saved.

## Configuration

- `NEXT_PUBLIC_API_URL` (in `web/.env.local`) - base URL of the FastAPI backend.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase auth.
- The generation model follows the backend's `LLM_PROVIDER` (`mistral` or
  `anthropic`) from the repo-root `.env` — nothing to configure here.
- Backend CORS: set `ALLOWED_ORIGINS` in the repo-root `.env` if the frontend
  isn't at `http://localhost:3000`.

## Notes

- The backend is stateless: history lives in Supabase and travels with each
  request, so conversations survive reloads, backend restarts, and multiple
  uvicorn workers.
- Follow-up questions are rewritten into standalone questions before retrieval
  (`rag/query.py`) — otherwise "what about the age range?" embeds with no idea
  what it's about and retrieves the wrong chunks.
