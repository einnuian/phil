"""Small LLM helpers that operate on the user's question rather than answer it.

`condense_question` rewrites a follow-up into a standalone question before
retrieval — retrieval embeds a single question with no conversational context, so
"what about the age range?" would otherwise pull back the wrong chunks.

`generate_title` names a conversation from its opening question, for the sidebar.

Both degrade to a sensible non-LLM fallback rather than failing the request.
"""

import re

from .config import CONDENSE_PROMPT, HISTORY_TURNS, TITLE_MAX_CHARS, TITLE_PROMPT


def _format_history(history, turns=HISTORY_TURNS):
    lines = []
    for turn in history[-turns:]:
        speaker = 'User' if turn['role'] == 'user' else 'Advisor'
        # Long answers add noise without helping resolve a reference; the opening
        # is what carries the subject.
        content = ' '.join((turn.get('content') or '').split())[:500]
        if content:
            lines.append(f'{speaker}: {content}')
    return '\n'.join(lines)


def condense_question(provider, question, history):
    """Return a self-contained version of `question`.

    Falls back to the original question whenever there's no history to draw on,
    or the rewrite fails — a slightly worse query beats a failed request.
    """
    formatted = _format_history(history or [])
    if not formatted:
        return question

    try:
        rewritten = provider.complete(
            CONDENSE_PROMPT.format(history=formatted, question=question)
        )
    except Exception:
        return question

    # Guard against a model that ignored the instruction and answered instead.
    if not rewritten or len(rewritten) > 4 * len(question) + 200:
        return question
    return rewritten


def truncate_title(question, limit=TITLE_MAX_CHARS):
    """Fallback title: the question itself, trimmed to fit the sidebar."""
    text = ' '.join(question.split())
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + '…'


def generate_title(provider, question):
    """Ask the model for a concise title for a conversation opening with `question`.

    Falls back to the trimmed question if the call fails or the reply doesn't
    look like a title — a conversation should always end up named.
    """
    try:
        title = provider.complete(TITLE_PROMPT.format(question=question), max_tokens=32)
    except Exception:
        return truncate_title(question)

    # Models like to wrap titles in quotes, prefix them with "Title:", or add a
    # full stop — strip all of that before it reaches the sidebar.
    title = ' '.join((title or '').split())
    title = re.sub(r'^(title|topic)\s*:\s*', '', title, flags=re.IGNORECASE)
    title = title.strip('"\'“”‘’').rstrip('.!,;:').strip()

    if not title or len(title) > TITLE_MAX_CHARS:
        return truncate_title(question)
    return title
