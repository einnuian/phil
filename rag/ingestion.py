import os

import chromadb
from docx import Document as DocxDocument
from openai import OpenAI
from pypdf import PdfReader
from tqdm import tqdm

from .config import (
    CHROMA_PATH,
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    COLLECTION_NAME,
    DOCS_PATH,
    EMBED_BATCH_SIZE,
    EMBEDDING_MODEL,
)


def load_documents(docs_path=DOCS_PATH):
    """Load PDFs (per page), Word docs, and text files into {text, source, page} dicts."""
    print(f'Loading documents from {docs_path}')

    if not os.path.isdir(docs_path):
        raise FileNotFoundError(f'The directory {docs_path} does not exist.')

    docs = []
    for root, dirnames, filenames in os.walk(docs_path):
        dirnames.sort()  # deterministic walk order
        for name in sorted(filenames):
            path = os.path.join(root, name)
            # Relative path keeps chunk IDs unique across subfolders and shows up in citations
            source = os.path.relpath(path, docs_path)
            ext = os.path.splitext(name)[1].lower()

            if ext == '.pdf':
                reader = PdfReader(path)
                for page_num, page in enumerate(reader.pages, start=1):
                    text = page.extract_text() or ''
                    if text.strip():
                        docs.append({'text': text, 'source': source, 'page': page_num})
            elif ext == '.docx':
                text = '\n'.join(p.text for p in DocxDocument(path).paragraphs)
                if text.strip():
                    docs.append({'text': text, 'source': source, 'page': None})
            elif ext == '.txt':
                with open(path, encoding='utf-8') as f:
                    text = f.read()
                if text.strip():
                    docs.append({'text': text, 'source': source, 'page': None})
            elif name == '.DS_Store' or name.endswith(':Zone.Identifier'):
                continue  # OS metadata junk — skip silently
            else:
                # Real file in an unsupported format (e.g. .pages, .doc, .rtf); warn
                # so its content isn't silently left out of the index.
                print(f'  Skipping unsupported file: {source}')

    if not docs:
        raise FileNotFoundError(f'No .pdf, .docx, or .txt files with text found in {docs_path}.')

    print(f'Loaded {len(docs)} pages/files from {len({d["source"] for d in docs})} documents')
    return docs


def split_text(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Split text into chunks of at most chunk_size characters.

    Prefers to break at paragraph, then sentence, then word boundaries,
    and overlaps consecutive chunks so context isn't lost at the seams.
    """
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            for separator in ('\n\n', '. ', '\n', ' '):
                cut = text.rfind(separator, start + chunk_size // 2, end)
                if cut != -1:
                    end = cut + len(separator)
                    break
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def chunk_documents(docs):
    """Split each document into chunks, carrying source/page metadata along."""
    chunks = []
    counters = {}  # per-file chunk index, so IDs stay unique across a PDF's pages
    for doc in docs:
        for piece in split_text(doc['text']):
            index = counters.get(doc['source'], 0)
            counters[doc['source']] = index + 1
            chunks.append({
                'id': f'{doc["source"]}:{index}',
                'text': piece,
                'source': doc['source'],
                'page': doc['page'],
            })

    print(f'Split into {len(chunks)} chunks')
    return chunks


def embed_and_store(chunks):
    """Embed chunks with OpenAI and upsert them into a persistent Chroma collection."""
    openai_client = OpenAI()
    chroma = chromadb.PersistentClient(path=CHROMA_PATH)
    collection = chroma.get_or_create_collection(COLLECTION_NAME)

    with tqdm(total=len(chunks), desc='Embedding chunks', unit='chunk') as bar:
        for i in range(0, len(chunks), EMBED_BATCH_SIZE):
            batch = chunks[i:i + EMBED_BATCH_SIZE]
            response = openai_client.embeddings.create(
                input=[c['text'] for c in batch],
                model=EMBEDDING_MODEL,
            )
            collection.upsert(
                ids=[c['id'] for c in batch],
                embeddings=[item.embedding for item in response.data],
                documents=[c['text'] for c in batch],
                # Chroma metadata values can't be None, so 0 means "no page number"
                metadatas=[{'source': c['source'], 'page': c['page'] or 0} for c in batch],
            )
            bar.update(len(batch))

    print(f'Collection "{COLLECTION_NAME}" now holds {collection.count()} chunks')
    return collection


def main():
    docs = load_documents()
    chunks = chunk_documents(docs)
    embed_and_store(chunks)
    print('Done. Run `python chat.py` to ask questions.')


if __name__ == '__main__':
    main()
