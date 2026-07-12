import os

import chromadb
from dotenv import load_dotenv
from openai import OpenAI

from ingestion_pipeline import CHROMA_PATH, COLLECTION_NAME, EMBEDDING_MODEL
from providers import make_provider

load_dotenv()

TOP_K = 6

# Which generation backend to use: 'mistral' or 'anthropic'. Override in .env.
# Fall back to mistral if not set
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'mistral')

# API keys each provider needs, on top of OPENAI_API_KEY (always required for embeddings).
PROVIDER_KEYS = {'anthropic': 'ANTHROPIC_API_KEY', 'mistral': 'MISTRAL_API_KEY'}


def retrieve(question, openai_client, collection, top_k=TOP_K):
    """Embed the question and return the top-k most similar chunks from Chroma."""
    embedding = openai_client.embeddings.create(
        input=[question],
        model=EMBEDDING_MODEL,
    ).data[0].embedding

    results = collection.query(query_embeddings=[embedding], n_results=top_k)
    return [
        {'text': doc, 'source': meta['source'], 'page': meta['page']}
        for doc, meta in zip(results['documents'][0], results['metadatas'][0])
    ]


def main():
    required = ['OPENAI_API_KEY', PROVIDER_KEYS.get(LLM_PROVIDER, '')]
    missing = [key for key in required if key and not os.getenv(key)]
    if missing:
        raise SystemExit(f'Missing {", ".join(missing)} — copy .env.example to .env and fill in your keys.')

    chroma = chromadb.PersistentClient(path=CHROMA_PATH)
    try:
        collection = chroma.get_collection(COLLECTION_NAME)
    except Exception:
        raise SystemExit('No document index found — run `python ingestion_pipeline.py` first.')

    provider = make_provider(LLM_PROVIDER)
    openai_client = OpenAI()

    print(f'CISV advisor Q&A ({provider.name}) — ask a question, or type "quit" to exit.')
    while True:
        try:
            question = input('\nQ: ').strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not question:
            continue
        if question.lower() in ('quit', 'exit'):
            break

        print()
        chunks = retrieve(question, openai_client, collection)
        try:
            sources = provider.ask(question, chunks)
        except Exception as e:
            print(f'\n{provider.name} API error: {e}')
            continue
        if sources:
            print('\nSources:')
            for source in sources:
                print(f'  - {source}')


if __name__ == '__main__':
    main()
