"""Turn a follow-up question into a standalone one before retrieval.

Retrieval embeds a single question with no conversational context, so "what about
the age range?" embeds almost meaninglessly and pulls back the wrong chunks. This
rewrites it using the recent turns, then hands the standalone form to `retrieve()`.
"""

from .config import CONDENSE_PROMPT, HISTORY_TURNS


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
