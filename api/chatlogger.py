import os

import httpx

_TIMEOUT = httpx.Timeout(2.0)


def _config():
    """Read config per call, not at import.

    `rag.config` is what loads `.env`, and it is imported *after* this module —
    so anything read at import time here would see an empty environment.
    """
    return (
        os.getenv('SUPABASE_URL', '').rstrip('/'),
        os.getenv('SUPABASE_SERVICE_KEY', '')
    )


def log_chat(question: str, answer: str):
    """send a question-answer pair to Supabase
    """
    supabase_url, service_key = _config()

    try:
        response = httpx.post(
            f'{supabase_url}/rest/v1/chat_logs',
            headers={'Authorization': f'Bearer {service_key}', 'apikey': service_key, 'Content-Type': 'application/json'},
            json={'question':question, 'answer':answer},
            timeout=_TIMEOUT,
        )
        print('logs:', response.status_code, response.text)
    except httpx.HTTPError as e:
        print('logs failed:', type(e).__name__, e)
        return