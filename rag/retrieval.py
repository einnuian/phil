"""Query-time retrieval: embed a question and pull the nearest chunks from Chroma."""

from .config import EMBEDDING_MODEL, TOP_K


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
