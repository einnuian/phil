"""Ragas experiment harness for the CISV advisor.

Follows the experiment API from ragas' "Evaluate and Improve a RAG App" guide
(see ragas_doc.md): a dataset of question/expected_answer rows, a couple of
discrete pass/fail metrics, and an @experiment function that runs the real
pipeline over every row. Each run writes a timestamped CSV under experiments/,
so a change to TOP_K or the provider can be compared against the baseline
instead of overwriting it.

Two metrics rather than one. `correctness` is the headline number. But a
correctness failure alone doesn't say whether retrieval missed the chunk or
generation ignored a chunk it had, and those call for opposite fixes — so
`retrieval_sufficiency` scores the retrieved context on its own. Reading the two
together splits failures cleanly:

    correctness fail + sufficiency fail  → retrieval problem (chunking, top_k)
    correctness fail + sufficiency pass  → generation problem (prompt, model)

Usage:
    python -m eval.evaluate                       # baseline over the whole dataset
    python -m eval.evaluate --limit 10            # cheap dry run
    python -m eval.evaluate --top-k 10 --tag topk10

Questions live in eval/datasets/cisv_qa.csv with columns `question` and
`expected_answer`.
"""

import argparse
import asyncio
from datetime import datetime
from pathlib import Path

import chromadb
import pandas as pd
from openai import OpenAI
from ragas import Dataset, experiment
from ragas.metrics import DiscreteMetric

from rag.config import CHROMA_PATH, COLLECTION_NAME, LLM_PROVIDER, TOP_K
from rag.providers import chunk_title, make_provider
from rag.retrieval import retrieve

EVAL_DIR = Path(__file__).resolve().parent
DATASET_NAME = 'phil_qa'


# --- Pipeline under test -----------------------------------------------------


class Pipeline:
    """The real advisor pipeline, wrapped for the experiment runner.

    Deliberately calls the same `retrieve` and the same provider the web app
    uses (see chat.py) rather than rebuilding the prompt here — the system
    prompt and the <document> wrapping are part of what's being measured, so a
    reconstruction would be scoring a pipeline that doesn't exist.
    """

    def __init__(self, top_k=TOP_K, provider_name=LLM_PROVIDER):
        chroma = chromadb.PersistentClient(path=CHROMA_PATH)
        try:
            self.collection = chroma.get_collection(COLLECTION_NAME)
        except Exception:
            raise SystemExit(
                f'No collection {COLLECTION_NAME!r} at {CHROMA_PATH}. '
                'Run `python -m rag.ingestion` first.'
            )
        self.openai_client = OpenAI()
        self.provider = make_provider(provider_name)
        self.top_k = top_k

    def _query_sync(self, question):
        # No history: each dataset row is a standalone question, so
        # condense_question would be a no-op. Multi-turn needs its own harness.
        chunks = retrieve(question, self.openai_client, self.collection, top_k=self.top_k)

        # stream_answer yields ('token', text) then a final ('sources', [...]);
        # the metrics want one plain string.
        parts = []
        for kind, payload in self.provider.stream_answer(question, chunks, history=None):
            if kind == 'token':
                parts.append(payload)

        return {
            'answer': ''.join(parts),
            'contexts': [c['text'] for c in chunks],
            'sources': [chunk_title(c) for c in chunks],
        }

    async def query(self, question):
        """Async wrapper so rows run concurrently.

        Both the OpenAI embedding call and the provider stream are blocking, so
        without a thread the event loop would serialise every row and undo the
        point of using the async runner.
        """
        return await asyncio.to_thread(self._query_sync, question)


# --- Metrics -----------------------------------------------------------------

# Encodes the advisor's own rules, which generic correctness metrics get wrong:
# refusing is the *correct* behaviour when the knowledge genuinely lacks an
# answer, and answering several labelled cases is correct when the question is
# under-specified. A stock metric marks both of those as failures.
correctness_metric = DiscreteMetric(
    name='correctness',
    prompt="""Compare the model response to the expected answer and determine if it's correct.

Return 'pass' if the response:
1. Contains the key information from the expected answer
2. Is factually accurate
3. Adequately addresses the question asked

Rules specific to this application:
- The assistant is a CISV advisor that must answer only from its reference \
documents. Extra correct detail beyond the expected answer is not a failure.
- If the expected answer depends on an unstated detail (for example the \
programme type), a response that answers each case separately and labels them \
clearly is a pass, as long as the expected answer is among the cases.
- A response that asks one specific clarifying question is a pass ONLY if the \
expected answer genuinely cannot be given without that detail.
- A refusal ("Sorry, I don't have the knowledge to answer this question") is a \
pass only when the expected answer is empty or itself states the information is \
unavailable. Otherwise a refusal is a fail.
- Differences in wording, formatting, or length do not matter.

Return 'fail' if the response contradicts the expected answer, omits its key \
information, or states facts that are not in it.

Question: {question}
Expected Answer: {expected_answer}
Model Response: {response}

Evaluation:""",
    allowed_values=['pass', 'fail'],
)

# Scores retrieval alone, so a correctness failure can be attributed. Judges the
# chunks only — whether the answer used them well is the other metric's job.
retrieval_sufficiency_metric = DiscreteMetric(
    name='retrieval_sufficiency',
    prompt="""You are judging a retrieval step, not an answer.

Below are the document chunks a retrieval system returned for a question, and \
the expected answer to that question.

Return 'pass' if the chunks contain enough information to derive the expected \
answer. The information may be spread across several chunks, and may require \
combining or computing over facts (totals, differences, durations) rather than \
being stated verbatim.

Return 'fail' if the information needed to derive the expected answer is absent \
from the chunks.

Ignore whether the chunks contain irrelevant material as well — you are judging \
only whether the necessary information is present.

Question: {question}
Expected Answer: {expected_answer}
Retrieved Chunks:
{retrieved_context}

Evaluation:""",
    allowed_values=['pass', 'fail'],
)


# --- Judge -------------------------------------------------------------------


def build_judge(name):
    """Return the LLM the metrics score with.

    Not the model under test where it can be helped — a model grading its own
    output grades it generously. Default to OpenAI so the Mistral and Anthropic
    providers are both judged by a third party.
    """
    from ragas.llms import llm_factory

    if name == 'openai':
        from openai import AsyncOpenAI

        return llm_factory('gpt-4.1', provider='openai', client=AsyncOpenAI())

    import anthropic

    from rag.config import ANTHROPIC_MODEL

    return llm_factory(
        ANTHROPIC_MODEL,
        provider='anthropic',
        client=anthropic.AsyncAnthropic(),
        max_tokens=4096,
    )


# --- Dataset -----------------------------------------------------------------


def load_dataset(limit=None):
    """Read eval/datasets/cisv_qa.csv into a ragas Dataset."""
    csv_path = EVAL_DIR / 'datasets' / f'{DATASET_NAME}.csv'
    if not csv_path.exists():
        raise SystemExit(f'No dataset at {csv_path} — add questions there first.')

    df = pd.read_csv(csv_path).fillna('')
    missing = {'question', 'expected_answer'} - set(df.columns)
    if missing:
        raise SystemExit(f'{csv_path} is missing column(s): {", ".join(sorted(missing))}')

    df = df[df['question'].str.strip() != '']
    if df.empty:
        raise SystemExit(
            f'{csv_path} has no questions yet. Add rows of question,expected_answer.'
        )
    if limit:
        df = df.head(limit)

    # Not saved: the local/csv backend writes back to this same path, so saving
    # a --limit run would truncate the source file down to the rows it used.
    dataset = Dataset(name=DATASET_NAME, backend='local/csv', root_dir=str(EVAL_DIR))
    for _, row in df.iterrows():
        dataset.append({
            'question': str(row['question']).strip(),
            'expected_answer': str(row['expected_answer']).strip(),
        })
    return dataset


# --- Experiment --------------------------------------------------------------


@experiment()
async def evaluate_rag(row, pipeline, llm):
    """Run the pipeline on one row and score it."""
    question = row['question']
    expected = row['expected_answer']

    result = await pipeline.query(question)
    response = result['answer']

    # Numbered, so the judge can refer to a specific chunk in its reason.
    retrieved_context = '\n\n'.join(
        f'Chunk {i} [{source}]:\n{text}'
        for i, (text, source) in enumerate(zip(result['contexts'], result['sources']), 1)
    )

    correctness, sufficiency = await asyncio.gather(
        correctness_metric.ascore(
            question=question,
            expected_answer=expected,
            response=response,
            llm=llm,
        ),
        retrieval_sufficiency_metric.ascore(
            question=question,
            expected_answer=expected,
            retrieved_context=retrieved_context,
            llm=llm,
        ),
    )

    return {
        **row,
        'response': response,
        'correctness_score': correctness.value,
        'correctness_reason': correctness.reason,
        'retrieval_sufficiency_score': sufficiency.value,
        'retrieval_sufficiency_reason': sufficiency.reason,
        # Sources are enough to see which documents were pulled; the full chunk
        # text would make the CSV unreadable.
        'retrieved_sources': ' | '.join(result['sources']),
    }


def summarise(results):
    """Print the pass rates, plus the split that says where to look."""
    total = len(results)
    if not total:
        print('No results.')
        return

    def rate(key):
        passed = sum(1 for r in results if r.get(key) == 'pass')
        return passed, passed / total * 100

    correct, correct_pct = rate('correctness_score')
    sufficient, sufficient_pct = rate('retrieval_sufficiency_score')

    print(f'\nCorrectness:            {correct}/{total} passed ({correct_pct:.1f}%)')
    print(f'Retrieval sufficiency:  {sufficient}/{total} passed ({sufficient_pct:.1f}%)')

    retrieval_bound = sum(
        1
        for r in results
        if r.get('correctness_score') == 'fail'
        and r.get('retrieval_sufficiency_score') == 'fail'
    )
    generation_bound = sum(
        1
        for r in results
        if r.get('correctness_score') == 'fail'
        and r.get('retrieval_sufficiency_score') == 'pass'
    )

    failures = total - correct
    if failures:
        print(f'\nOf {failures} correctness failures:')
        print(f'  {retrieval_bound} had insufficient context  → retrieval problem')
        print(f'  {generation_bound} had sufficient context    → generation problem')


async def run(args):
    dataset = load_dataset(limit=args.limit)
    pipeline = Pipeline(top_k=args.top_k, provider_name=args.provider)
    llm = build_judge(args.judge)

    # The name is the whole point of the experiment API: it keeps each run's CSV
    # rather than overwriting, so variants stay comparable. Encode what changed.
    tag = args.tag or f'{args.provider}_top{args.top_k}'
    name = f"{datetime.now().strftime('%Y%m%d-%H%M%S')}_{tag}"

    print(f'Running {len(dataset)} questions — {pipeline.provider.name}, top_k={args.top_k}')
    results = await evaluate_rag.arun(dataset, name=name, pipeline=pipeline, llm=llm)

    summarise(results)
    print(f'\nExperiment: {name}')
    print(f'Per-question results under {EVAL_DIR / "experiments"}/')
    return results


def main():
    parser = argparse.ArgumentParser(description='Evaluate the RAG pipeline with ragas')
    parser.add_argument('--limit', type=int, help='only run the first N questions')
    parser.add_argument('--top-k', type=int, default=TOP_K, help=f'default {TOP_K}')
    parser.add_argument(
        '--provider',
        default=LLM_PROVIDER,
        choices=['mistral', 'anthropic'],
        help=f'generation backend under test (default {LLM_PROVIDER})',
    )
    parser.add_argument(
        '--judge',
        default='openai',
        choices=['openai', 'anthropic'],
        help='model that scores the metrics (default openai)',
    )
    parser.add_argument('--tag', help='label for this run, e.g. topk10 (default provider_topK)')
    args = parser.parse_args()

    asyncio.run(run(args))


if __name__ == '__main__':
    main()
