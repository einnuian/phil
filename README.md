# Phil - a CISV Advisor using RAG

A small retrieval-augmented Q&A assistant for CISV volunteers and staff. Point it
at your reference documents (PDF, Word, or text), and ask questions from either a
terminal or a web UI - it answers using **only** those documents and lists the
sources it drew from.

## How it works

1. **Ingestion** (`rag/ingestion.py`) - loads documents from `docs/`, splits
   them into overlapping chunks, embeds each chunk with OpenAI
   (`text-embedding-3-small`), and stores them in a local [Chroma](https://www.trychroma.com/)
   database (`chroma_db/`).
2. **Retrieval + generation** (`rag/retrieval.py`, `rag/providers.py`) - embeds your
   question, retrieves the most similar chunks from Chroma, and passes them to a
   generation model to produce a cited answer.

Retrieval always uses OpenAI embeddings. Answer generation is pluggable between
**Mistral** and **Anthropic (Claude)** via the `LLM_PROVIDER` setting (see below).

Two interfaces consume this pipeline: the **`chat.py` CLI** and a **web UI** (a
FastAPI server in `api/` streaming to a Next.js app in `web/`).

## Project structure

```
rag/            core library - shared by every interface
  config.py       all paths, model ids, and tunables (loads .env)
  ingestion.py    build the Chroma index from docs/
  retrieval.py    retrieve() - embed a question, fetch nearest chunks
  providers.py    Mistral / Anthropic generation (streaming + citations)
api/server.py   FastAPI SSE endpoint (reuses rag/)
chat.py         terminal CLI (reuses rag/)
web/            Next.js + TypeScript + Tailwind frontend
docs/           your source documents (git-ignored)
chroma_db/      the local vector index (git-ignored)
```

## Requirements

- Python 3.10+
- An OpenAI API key (for embeddings)
- A Mistral **or** Anthropic API key (for generation), depending on your provider

## Setup

```bash
# 1. Create and activate a virtual environment
python -m venv venv
source venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure your keys
cp .env.example .env
# then edit .env and fill in your API keys
```

### Environment variables

Set these in `.env`:

| Variable            | Required                        | Notes                                        |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `LLM_PROVIDER`      | optional (default `mistral`)    | Generation backend: `mistral` or `anthropic` |
| `OPENAI_API_KEY`    | always                          | Used for document embeddings                 |
| `MISTRAL_API_KEY`   | when `LLM_PROVIDER=mistral`     | Generation                                   |
| `ANTHROPIC_API_KEY` | when `LLM_PROVIDER=anthropic`   | Generation                                   |

## Running it locally

```bash
# 1. Add your source documents (.pdf, .docx, .txt) to the docs/ folder
mkdir -p docs
cp /path/to/your/files/* docs/

# 2. Build the index (re-run whenever the documents change)
python -m rag.ingestion

# 3. Start the Q&A session
python chat.py
```

> Run these commands from the repository root. Paths in `rag/config.py` are
> anchored to the repo root, so the index location is stable regardless.

Then ask questions at the `Q:` prompt. Type `quit` or `exit` (or press Ctrl-D) to leave.

```
CISV advisor Q&A (Mistral) - ask a question, or type "quit" to exit.

Q: What is the refund policy for a cancelled programme?
...answer with inline [Source: ...] citations...

Sources:
  - handbook.pdf (page 4)
```

## Web UI

A streaming chat interface (Next.js + TypeScript + Tailwind) lives in `web/`, backed
by the FastAPI server in `api/`. From the repo root:

```bash
# Terminal 1 - API backend
uvicorn api.server:app --reload --port 8000

# Terminal 2 - frontend
cd web && npm install && cp .env.local.example .env.local && npm run dev
```

Then open http://localhost:3000. See `web/README.md` for details.

## Publishing the backend image to GHCR

The `Dockerfile` builds the API image with the Chroma index baked in - the `web/`
frontend is excluded and deploys separately. To publish it to the GitHub Container
Registry:

```bash
# 1. Build the index first. The Dockerfile COPIES chroma_db/ in; it is never
#    generated during the build, so a stale index ships a stale image.
python -m rag.ingestion

# 2. Authenticate. Use a personal access token (classic) with `write:packages`
#    scope - a GitHub password will not work.
echo "$CR_PAT" | docker login ghcr.io -u einnuian --password-stdin

# 3. Build, tagging with the full registry path.
docker build -t ghcr.io/einnuian/cisv-rag:latest .

# 4. Push.
docker push ghcr.io/einnuian/cisv-rag:latest
```

Then pull and run it anywhere, passing secrets at runtime - they are never baked
into the image:

```bash
docker run -p 8000:8000 \
  -e OPENAI_API_KEY=sk-... \
  -e MISTRAL_API_KEY=... \
  -e LLM_PROVIDER=mistral \
  -e ALLOWED_ORIGINS=https://your-frontend.example \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_ANON_KEY=... \
  ghcr.io/einnuian/cisv-rag:latest
```

Tag a version alongside `latest`, so a bad deploy has something to roll back to:

```bash
docker build \
  -t ghcr.io/einnuian/cisv-rag:latest \
  -t ghcr.io/einnuian/cisv-rag:v1 .
docker push --all-tags ghcr.io/einnuian/cisv-rag
```

To have the package link back to this repository on GitHub - inheriting its
description and visibility - add this label to the `Dockerfile`:

```dockerfile
LABEL org.opencontainers.image.source=https://github.com/einnuian/cisv-rag
```