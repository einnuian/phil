"""FastAPI server exposing the CISV advisor over an SSE streaming endpoint.

Reuses the existing RAG pipeline unchanged: `retrieve()` for Chroma + OpenAI
embeddings, and the providers in `providers.py` for generation. Each browser
session gets its own provider instance (and thus its own conversation history),
keyed by a session id the frontend generates.

Run with:  uvicorn api.server:app --reload --port 8000
"""

import json
import os

import chromadb
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from rag.config import CHROMA_PATH, COLLECTION_NAME, LLM_PROVIDER
from rag.providers import make_provider
from rag.retrieval import retrieve

# Comma-separated list of allowed frontend origins (the Next.js dev server by default).
ALLOWED_ORIGINS = os.getenv('ALLOWED_ORIGINS', 'http://localhost:3000').split(',')

app = FastAPI(title='CISV Advisor API')
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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

# One provider (conversation) per session id. In-memory, so history resets on restart.
_sessions = {}


class ChatRequest(BaseModel):
    session_id: str
    question: str


def _sse(payload):
    """Format a dict as a Server-Sent Events data frame."""
    return f'data: {json.dumps(payload)}\n\n'


@app.get('/api/health')
def health():
    return {'status': 'ok', 'provider': LLM_PROVIDER}


@app.post('/api/chat')
def chat(req: ChatRequest):
    provider = _sessions.get(req.session_id)
    if provider is None:
        provider = make_provider(LLM_PROVIDER)
        _sessions[req.session_id] = provider

    # Retrieve before opening the stream so retrieval errors surface as a normal
    # HTTP error rather than mid-stream.
    chunks = retrieve(req.question, _openai_client, _collection)

    def event_stream():
        try:
            for kind, payload in provider.stream_answer(req.question, chunks):
                if kind == 'token':
                    yield _sse({'type': 'token', 'text': payload})
                elif kind == 'sources':
                    yield _sse({'type': 'sources', 'sources': payload})
            yield _sse({'type': 'done'})
        except Exception as e:  # provider already rolled back its unanswered turn
            yield _sse({'type': 'error', 'message': str(e)})

    return StreamingResponse(event_stream(), media_type='text/event-stream')
