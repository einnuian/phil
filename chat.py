import os

import anthropic
import chromadb
from dotenv import load_dotenv
from openai import OpenAI

from ingestion_pipeline import CHROMA_PATH, COLLECTION_NAME, EMBEDDING_MODEL

load_dotenv()

MODEL = 'claude-opus-4-8'
TOP_K = 6

SYSTEM_PROMPT = """You are an experienced CISV advisor. You answer questions from \
volunteers and staff using ONLY the reference documents provided in each message.

Rules:
- Base every answer on the provided documents and cite them.
- If the documents don't cover the question, say so plainly ("That isn't covered \
in the documents I have") rather than guessing or using outside knowledge.
- Be practical and concise, like an experienced colleague explaining a procedure."""


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


def build_user_content(question, chunks):
    """Package retrieved chunks as citable document blocks, followed by the question."""
    content = []
    for chunk in chunks:
        title = chunk['source']
        if chunk['page']:
            title += f' (page {chunk["page"]})'
        content.append({
            'type': 'document',
            'source': {'type': 'text', 'media_type': 'text/plain', 'data': chunk['text']},
            'title': title,
            'citations': {'enabled': True},
        })
    content.append({'type': 'text', 'text': question})
    return content


def answer(question, messages, anthropic_client, openai_client, collection):
    """Retrieve context, stream Claude's answer, and print the cited sources."""
    chunks = retrieve(question, openai_client, collection)
    messages.append({'role': 'user', 'content': build_user_content(question, chunks)})

    with anthropic_client.messages.stream(
        model=MODEL,
        max_tokens=16000,
        thinking={'type': 'adaptive'},
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            print(text, end='', flush=True)
        final = stream.get_final_message()
    print()

    sources = []
    for block in final.content:
        if block.type == 'text' and block.citations:
            for citation in block.citations:
                if citation.document_title and citation.document_title not in sources:
                    sources.append(citation.document_title)
    if sources:
        print('\nSources:')
        for source in sources:
            print(f'  - {source}')

    # Keep the full content blocks (including thinking) so follow-up turns replay cleanly,
    # but drop empty text blocks — citations can leave a trailing one, and the API
    # rejects them ("text content blocks must be non-empty") when replayed
    content = [b for b in final.content if b.type != 'text' or b.text]
    messages.append({'role': 'assistant', 'content': content})


def main():
    missing = [key for key in ('ANTHROPIC_API_KEY', 'OPENAI_API_KEY') if not os.getenv(key)]
    if missing:
        raise SystemExit(f'Missing {", ".join(missing)} — copy .env.example to .env and fill in your keys.')

    chroma = chromadb.PersistentClient(path=CHROMA_PATH)
    try:
        collection = chroma.get_collection(COLLECTION_NAME)
    except Exception:
        raise SystemExit('No document index found — run `python ingestion_pipeline.py` first.')

    anthropic_client = anthropic.Anthropic()
    openai_client = OpenAI()
    messages = []

    print('CISV advisor Q&A — ask a question, or type "quit" to exit.')
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
        try:
            answer(question, messages, anthropic_client, openai_client, collection)
        except anthropic.APIError as e:
            print(f'\nClaude API error: {e}')
            if messages and messages[-1]['role'] == 'user':
                messages.pop()  # drop the unanswered turn so history stays valid


if __name__ == '__main__':
    main()
