# Backend image for the CISV advisor API, with the Chroma index baked in.
#
# The index is COPIED in, not generated here — so build it first:
#   python -m rag.ingestion          # produces ./chroma_db
#   docker build -t cisv-advisor-api .
#
# Run it, passing secrets at runtime (they are never baked into the image):
#   docker run -p 8000:8000 \
#     -e OPENAI_API_KEY=sk-... \
#     -e MISTRAL_API_KEY=... \
#     -e LLM_PROVIDER=mistral \
#     -e ALLOWED_ORIGINS=https://your-frontend.example \
#     -e SUPABASE_URL=https://your-project.supabase.co \
#     -e SUPABASE_ANON_KEY=... \
#     cisv-advisor-api
#
# SUPABASE_URL and SUPABASE_ANON_KEY are required: /api/chat and /api/title
# verify the caller's session against them and fail closed (503) without them.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# If a dependency ever fails to build on slim (needs a C compiler), uncomment:
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential \
#     && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

# Application code (backend only — the web/ frontend deploys separately).
COPY rag/ rag/
COPY api/ api/
COPY chat.py .

# Bake in the pre-built, read-only vector index. rag/config.py anchors CHROMA_PATH
# to the repo root (/app here), so this lands exactly where the app looks for it.
COPY chroma_db/ chroma_db/

# Drop root for runtime.
RUN useradd --create-home --uid 1000 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000

# Simple liveness check against the API's health endpoint (curl isn't in slim).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

CMD ["uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
