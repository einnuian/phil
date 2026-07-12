# CISV Advisor RAG

A small retrieval-augmented Q&A assistant for CISV volunteers and staff. Point it
at your reference documents (PDF, Word, or text), and ask questions in the
terminal — it answers using **only** those documents and lists the sources it drew from.

## How it works

1. **Ingestion** (`ingestion_pipeline.py`) — loads documents from `docs/`, splits
   them into overlapping chunks, embeds each chunk with OpenAI
   (`text-embedding-3-small`), and stores them in a local [Chroma](https://www.trychroma.com/)
   database (`chroma_db/`).
2. **Chat** (`chat.py`) — embeds your question, retrieves the most similar chunks
   from Chroma, and passes them to a generation model to produce a cited answer.

Retrieval always uses OpenAI embeddings. Answer generation is pluggable between
**Mistral** and **Anthropic (Claude)** via the `LLM_PROVIDER` setting (see below).

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
python ingestion_pipeline.py

# 3. Start the Q&A session
python chat.py
```

Then ask questions at the `Q:` prompt. Type `quit` or `exit` (or press Ctrl-D) to leave.

```
CISV advisor Q&A (Mistral) — ask a question, or type "quit" to exit.

Q: What is the refund policy for a cancelled programme?
...answer with inline [Source: ...] citations...

Sources:
  - handbook.pdf (page 4)
```

## Switching the generation model

Set `LLM_PROVIDER` in `.env` to `mistral` or `anthropic` and make sure the matching
API key is present. The model IDs live at the top of `providers.py`
(`MISTRAL_MODEL`, `ANTHROPIC_MODEL`) if you want to pin a different model or snapshot.

> **Note on citations:** Claude produces token-level citations natively, so its
> "Sources" list reflects exactly which documents were cited. Mistral has no
> citation API, so documents are labelled with `[Source: ...]` tags in the prompt
> and the "Sources" list reflects the documents retrieved for that question.
