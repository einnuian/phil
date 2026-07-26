"""Central configuration for the CISV advisor.

Everything tunable lives here: storage paths, model ids, and the system prompt.
`.env` is loaded once in this module, so every other module gets a consistent view
of the environment just by importing from here.

Paths are anchored to the repository root, so commands work regardless of the
current working directory.
"""

import os

from dotenv import load_dotenv

load_dotenv()

# Repo root = the directory containing this package.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Storage / index
DOCS_PATH = os.path.join(REPO_ROOT, 'docs')
CHROMA_PATH = os.path.join(REPO_ROOT, 'chroma_db')
COLLECTION_NAME = 'cisv_docs'

# Embeddings (OpenAI) — used for both ingestion and query-time retrieval
EMBEDDING_MODEL = 'text-embedding-3-small'

# Chunking (ingestion)
CHUNK_SIZE = 3000  # characters, roughly 800 tokens
CHUNK_OVERLAP = 300
EMBED_BATCH_SIZE = 100

# Retrieval
TOP_K = 6

# Generation models
ANTHROPIC_MODEL = 'claude-opus-4-8'
MISTRAL_MODEL = 'mistral-small-latest'  # newest Small; pin a snapshot e.g. 'mistral-small-2506'

SYSTEM_PROMPT = """You are an experienced CISV advisor. You answer questions from \
volunteers and staff using the reference documents provided, together with the earlier \
turns of this conversation.

Each document is provided with its source label.

Rules:
- Base factual claims on the provided documents and cite the source tag inline, e.g. \
"[Source: handbook.pdf (page 3)]", whenever you use a document.
- Earlier turns of this conversation are context too. Use them to interpret follow-up \
questions ("what about the age range?"), and you may rely on documents you were given \
earlier in the conversation without being re-shown them.
- If neither the documents nor the conversation covers the question, say so plainly \
("That isn't covered in the documents I have") rather than guessing or using outside \
knowledge.
- Be practical and concise, like an experienced colleague explaining a procedure."""

# Retrieval embeds one question at a time, so a bare follow-up ("what about the age
# range?") retrieves badly. This rewrites it into a self-contained question first.
CONDENSE_PROMPT = """Rewrite the follow-up question below as a standalone question that \
makes sense on its own, using the conversation only to resolve pronouns and implicit \
references. Keep the original wording wherever you can, and do not answer the question.

Conversation so far:
{history}

Follow-up question: {question}

Standalone question:"""

# How many prior turns to carry into the condense prompt and the generation call.
HISTORY_TURNS = 10

# Generation backend: 'mistral' or 'anthropic'. Override in .env.
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'mistral')

# API keys each provider needs, on top of OPENAI_API_KEY (always required for embeddings).
PROVIDER_KEYS = {'anthropic': 'ANTHROPIC_API_KEY', 'mistral': 'MISTRAL_API_KEY'}
