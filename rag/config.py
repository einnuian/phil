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
volunteers and staff using ONLY the reference documents provided in each message.

Each document is provided with its source label.

Rules:
- Base every answer on the provided documents and cite the source tag inline, e.g. \
"[Source: handbook.pdf (page 3)]", whenever you use a document.
- If the documents don't cover the question, say so plainly ("That isn't covered \
in the documents I have") rather than guessing or using outside knowledge.
- Be practical and concise, like an experienced colleague explaining a procedure."""

# Generation backend: 'mistral' or 'anthropic'. Override in .env.
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'mistral')

# API keys each provider needs, on top of OPENAI_API_KEY (always required for embeddings).
PROVIDER_KEYS = {'anthropic': 'ANTHROPIC_API_KEY', 'mistral': 'MISTRAL_API_KEY'}
