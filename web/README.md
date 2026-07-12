# CISV Advisor — Web UI

A Next.js (App Router) + TypeScript + Tailwind chat interface for the CISV
advisor. It streams answers token-by-token over SSE from the FastAPI backend
(`../api/server.py`), which reuses the existing Python RAG pipeline.

```
web/ (this app)  ──POST /api/chat──▶  api/server.py (FastAPI)
                 ◀──── SSE tokens ────   ├─ retrieve()  (Chroma + OpenAI embeddings)
                                         └─ providers.py (Mistral / Anthropic)
```

## Prerequisites

- The Chroma index must be built: from the repo root, `python -m rag.ingestion`.
- Backend dependencies installed (repo root): `pip install -r requirements.txt`.

## Run it (two terminals)

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

## Configuration

- `NEXT_PUBLIC_API_URL` (in `web/.env.local`) — base URL of the FastAPI backend.
- The generation model follows the backend's `LLM_PROVIDER` (`mistral` or
  `anthropic`) from the repo-root `.env` — nothing to configure here.
- Backend CORS: set `ALLOWED_ORIGINS` in the repo-root `.env` if the frontend
  isn't at `http://localhost:3000`.

## Notes

- Each browser tab gets a random `session_id`, so the backend keeps one
  conversation (with history) per tab. History is in-memory and resets when the
  backend restarts.
