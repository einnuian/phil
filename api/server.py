"""FastAPI server exposing the CISV advisor over an SSE streaming endpoint.

Reuses the existing RAG pipeline: `retrieve()` for Chroma + OpenAI embeddings,
and the providers in `providers.py` for generation.

Stateless by design — the client sends the prior turns with each question and
Supabase is the source of truth for them. Nothing is kept in process, so
restarts and multiple workers never lose or split a conversation.

Run with:  uvicorn api.server:app --reload --port 8000
"""

import json
import os

import chromadb
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from api.auth import require_user
from rag.config import CHROMA_PATH, COLLECTION_NAME, HISTORY_TURNS, LLM_PROVIDER
from rag.providers import make_provider
from rag.query import condense_question, generate_title
from rag.retrieval import retrieve

# Comma-separated list of exact allowed frontend origins (the Next.js dev server by default).
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',') if o.strip()
]

# Optional regex matching a whole family of origins, on top of the exact list above.
# An origin is allowed if it's in ALLOWED_ORIGINS OR matches this pattern. Useful for
# Vercel preview deployments, which get a unique URL per branch. For example:
#   ALLOWED_ORIGIN_REGEX=https://cisv-rag-.*\.vercel\.app
ALLOWED_ORIGIN_REGEX = os.getenv('ALLOWED_ORIGIN_REGEX') or None

app = FastAPI(title='CISV Advisor API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=['*'],
    allow_headers=['*'],
)

# Shared, read-only resources initialised once at startup.
_openai_client = OpenAI()
_chroma = chromadb.PersistentClient(path=CHROMA_PATH)
try:
    _collection = _chroma.get_collection(COLLECTION_NAME)
except Exception:
    raise SystemExit('No document index found — run `python -m rag.ingestion` first.')

# One shared provider — providers hold no conversation state.
_provider = make_provider(LLM_PROVIDER)


class Turn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    question: str
    # Prior turns of this conversation, oldest first. The client owns them.
    history: list[Turn] = []


def _sse(payload):
    """Format a dict as a Server-Sent Events data frame."""
    return f'data: {json.dumps(payload)}\n\n'


@app.get('/api/health')
def health():
    return {'status': 'ok', 'provider': LLM_PROVIDER}


class TitleRequest(BaseModel):
    question: str
    # The first answer, used to disambiguate what the question was about.
    answer: str = ''


@app.post('/api/title')
def title(req: TitleRequest, user=Depends(require_user)):
    """Name a conversation from its opening exchange, for the sidebar."""
    return {'title': generate_title(_provider, req.question, req.answer)}


@app.post('/api/chat')
def chat(req: ChatRequest, user=Depends(require_user)):
    history = [t.model_dump() for t in req.history][-HISTORY_TURNS:]

    # A bare follow-up ("what about the age range?") embeds poorly on its own, so
    # rewrite it against the history before retrieving.
    search_query = condense_question(_provider, req.question, history)

    # Retrieve before opening the stream so retrieval errors surface as a normal
    # HTTP error rather than mid-stream.
    chunks = retrieve(search_query, _openai_client, _collection)

    def event_stream():
        try:
            for kind, payload in _provider.stream_answer(req.question, chunks, history):
                if kind == 'token':
                    yield _sse({'type': 'token', 'text': payload})
                elif kind == 'sources':
                    yield _sse({'type': 'sources', 'sources': payload})
            yield _sse({'type': 'done'})
        except Exception as e:  # provider already rolled back its unanswered turn
            yield _sse({'type': 'error', 'message': str(e)})

    return StreamingResponse(event_stream(), media_type='text/event-stream')
