"""Supabase session verification for the API.

Validation goes through Supabase's auth endpoint rather than checking a JWT
signature locally. That costs one HTTP round trip per request, but it is correct
in cases local verification is not:

  * it works whether the project signs tokens with the legacy HS256 shared
    secret or the newer asymmetric keys, and
  * it rejects tokens belonging to deleted or signed-out users immediately,
    instead of honouring them until the token happens to expire — which matters
    now that accounts can delete themselves.

At this app's volume (single-digit questions per minute) the round trip is
irrelevant next to generation latency.
"""

import os

import httpx
from fastapi import Header, HTTPException

SUPABASE_URL = os.getenv('SUPABASE_URL', '').rstrip('/')
SUPABASE_ANON_KEY = os.getenv('SUPABASE_ANON_KEY', '')

_TIMEOUT = httpx.Timeout(10.0)


async def require_user(authorization: str = Header(default='')):
    """FastAPI dependency: resolve the caller, or reject the request.

    Returns the Supabase user object so handlers can attribute usage.
    """
    # Fail closed. An unconfigured server must not silently accept everyone —
    # that is the exact hole this module exists to close.
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(
            status_code=503,
            detail='Auth is not configured — set SUPABASE_URL and SUPABASE_ANON_KEY.',
        )

    scheme, _, token = authorization.partition(' ')
    if scheme.lower() != 'bearer' or not token:
        raise HTTPException(status_code=401, detail='Missing bearer token.')

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            response = await client.get(
                f'{SUPABASE_URL}/auth/v1/user',
                headers={'Authorization': f'Bearer {token}', 'apikey': SUPABASE_ANON_KEY},
            )
    except httpx.HTTPError:
        # Auth is unreachable: refuse rather than wave the request through.
        raise HTTPException(status_code=503, detail='Could not reach the auth service.')

    if response.status_code != 200:
        raise HTTPException(status_code=401, detail='Invalid or expired session.')

    return response.json()
