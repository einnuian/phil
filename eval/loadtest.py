"""Concurrency load test for the CISV advisor API.

Two ways to run it

  Stub mode

      LLM_PROVIDER=stub uvicorn api.server:app --port 8000
      python -m eval.loadtest --users 1,5,10,20,40,60

  Real mode

      python -m eval.loadtest --url https://... --users 5 --requests 2


Usage:
    python -m eval.loadtest                                  # 1,5,10,20,40 against localhost
    python -m eval.loadtest --users 20 --requests 3          # one level, 3 requests each
    python -m eval.loadtest --url https://... --users 5      # against a deployment
"""

import argparse
import asyncio
import json
import time
from dataclasses import dataclass

import httpx

DEFAULT_QUESTIONS = [
    'What is the minimum age for a Village participant?',
    'How long does an Interchange programme last?',
    'What are the responsibilities of a camp director?',
    'How many leaders does a delegation need?',
    'What is the role of a Junior Counsellor?',
    'What insurance does a participant need?',
]


@dataclass
class Result:
    """One completed (or failed) chat stream."""

    ttft: float | None  # seconds to the first token; None if none arrived
    total: float  # seconds to the done frame, or to the failure
    error: str | None = None  # error class, used to group failures
    detail: str | None = None  # the server's own message, for diagnosis


async def one_request(client, url, question, timeout):
    """POST one question and consume the SSE stream to completion."""
    started = time.perf_counter()
    ttft = None
    try:
        async with client.stream(
            'POST',
            f'{url}/api/chat',
            json={'question': question, 'history': []},
            timeout=timeout,
        ) as response:
            if response.status_code != 200:
                # The body carries the reason — a provider 429, a traceback from
                # a failed retrieval — so keep it rather than just the status.
                body = ' '.join((await response.aread()).decode('utf8', 'replace').split())
                return Result(
                    None,
                    time.perf_counter() - started,
                    f'http_{response.status_code}',
                    body[:300],
                )

            async for line in response.aiter_lines():
                if not line.startswith('data: '):
                    continue
                event = json.loads(line[6:])
                if event['type'] == 'token':
                    if ttft is None:
                        ttft = time.perf_counter() - started
                elif event['type'] == 'error':
                    # The endpoint reports provider failures inside the stream
                    # (a 200 was already sent), so these need catching here.
                    message = str(event.get('message', ''))[:300]
                    return Result(ttft, time.perf_counter() - started, 'stream_error', message)
                elif event['type'] == 'done':
                    break
    except httpx.TimeoutException:
        return Result(ttft, time.perf_counter() - started, 'timeout', f'exceeded {timeout}s')
    except Exception as e:
        return Result(ttft, time.perf_counter() - started, type(e).__name__, str(e)[:300])

    return Result(ttft, time.perf_counter() - started)


async def virtual_user(client, url, questions, requests_each, timeout, index):
    """One user asking `requests_each` questions back to back."""
    results = []
    for n in range(requests_each):
        question = questions[(index + n) % len(questions)]
        results.append(await one_request(client, url, question, timeout))
    return results


async def run_level(url, users, requests_each, timeout, questions):
    """Fire `users` concurrent virtual users and return their results."""
    # httpx pools connections; without raising the cap the client itself would
    # serialise requests and we'd measure the load generator instead.
    limits = httpx.Limits(max_connections=users + 10, max_keepalive_connections=users + 10)

    async with httpx.AsyncClient(limits=limits) as client:
        # One throwaway request first: the very first call to a cold server pays
        # for lazy imports and connection setup, which would land entirely on
        # whichever level ran first and look like a capacity problem.
        await one_request(client, url, questions[0], timeout)

        started = time.perf_counter()
        batches = await asyncio.gather(
            *[
                virtual_user(client, url, questions, requests_each, timeout, i)
                for i in range(users)
            ]
        )
        elapsed = time.perf_counter() - started

    return [r for batch in batches for r in batch], elapsed


def percentile(values, p):
    """Nearest-rank percentile. Returns None for an empty sample."""
    if not values:
        return None
    ordered = sorted(values)
    index = min(int(round((p / 100) * (len(ordered) - 1))), len(ordered) - 1)
    return ordered[index]


def fmt(seconds):
    return '     -' if seconds is None else f'{seconds:6.2f}'


def summarise(users, results, elapsed):
    """Print one row of the results table and return the errors seen."""
    ok = [r for r in results if r.error is None]
    ttfts = [r.ttft for r in ok if r.ttft is not None]
    totals = [r.total for r in ok]

    # Group failures by class, keeping one example message per class — the
    # status code alone rarely says which limit you hit.
    errors = {}
    for r in results:
        if r.error:
            count, detail = errors.get(r.error, (0, None))
            errors[r.error] = (count + 1, detail or r.detail)

    print(
        f'{users:>5}  {len(results):>5}  {len(ok):>4}  {len(results) - len(ok):>4}  '
        f'{fmt(percentile(ttfts, 50))}  {fmt(percentile(ttfts, 95))}  '
        f'{fmt(percentile(totals, 50))}  {fmt(percentile(totals, 95))}  '
        f'{len(ok) / elapsed:>6.2f}'
    )
    return errors


async def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--url', default='http://localhost:8000', help='base URL of the API')
    parser.add_argument(
        '--users',
        default='1,5,10,20,40',
        help='concurrency levels to test, comma-separated (e.g. 1,5,10,20,40,60)',
    )
    parser.add_argument('--requests', type=int, default=1, help='requests per virtual user')
    parser.add_argument('--timeout', type=float, default=120.0, help='per-request timeout, seconds')
    parser.add_argument(
        '--question',
        action='append',
        help='question to ask; repeat for several. Defaults to a built-in set.',
    )
    args = parser.parse_args()

    url = args.url.rstrip('/')
    levels = [int(u) for u in args.users.split(',') if u.strip()]
    questions = args.question or DEFAULT_QUESTIONS

    # Which backend is live decides whether this run costs money. Say so up
    # front — mistaking real mode for stub mode is the expensive mistake here.
    async with httpx.AsyncClient() as client:
        try:
            health = (await client.get(f'{url}/api/health', timeout=30)).json()
        except Exception as e:
            raise SystemExit(f'Cannot reach {url}: {e}')

    provider = health.get('provider', 'unknown')
    print(f'Target:   {url}')
    print(f'Provider: {provider}')
    if provider != 'stub':
        total = sum(levels) * args.requests
        print(
            f'\n  WARNING: the server is running the real {provider!r} backend, so this run\n'
            f'  will make ~{total} live generations and count against your rate limit.\n'
            f'  For a pure concurrency measurement, restart it with LLM_PROVIDER=stub.'
        )

    print('\nusers   reqs    ok   err  ttft50  ttft95   tot50   tot95   req/s')
    all_errors = {}
    for users in levels:
        results, elapsed = await run_level(url, users, args.requests, args.timeout, questions)
        for name, (count, detail) in summarise(users, results, elapsed).items():
            seen, first = all_errors.get(name, (0, None))
            all_errors[name] = (seen + count, first or detail)

    if all_errors:
        print('\nErrors:')
        for name, (count, detail) in sorted(all_errors.items(), key=lambda kv: -kv[1][0]):
            print(f'  {count:>4}  {name}')
            if detail:
                print(f'        {detail}')
        print(
            '\n  http_429 is the provider throttling you; timeout, http_5xx and\n'
            '  ConnectError are your own app or host giving out.'
        )

    print(
        '\nThe concurrency limit is the level where ttft95 starts rising with the\n'
        'user count — below that the app has spare capacity, above it requests queue.'
    )


if __name__ == '__main__':
    asyncio.run(main())
