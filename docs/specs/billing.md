# StoryToRole spec: Billing and credits

Draft. Decisions are recorded here as they close; open points are listed at the end.

## Credits

- Plans are monthly subscriptions (Free, BYOK, Essencial, Intensivo) that grant **credits**. Never priced per opening.
- Every AI action consumes credits: fit checks, generations and adjustments (adaptation to another language, language sync, cover letter update). Credits replace separate counters for evaluation and generation; actions still differ in how many credits they cost.

## Cost model (estimate)

Prices from the Claude API reference, cached 2026-10-06, in USD per million tokens: Haiku 5.5 $0.10 input / $0.50 output; Sonnet 5.5 $2 / $10 (cache reads $0.20); Opus 5.5 $4 / $20 (cache reads $0.20). Cache writes cost 1.25x input.

Token assumptions per action, to be replaced by measured usage from the first prototype (the provider adapter records usage per call):

| Action | Calls and tokens assumed | Model | Estimated AI cost (USD) |
| --- | --- | --- | --- |
| Fit check | Keyword extraction (2k in, 1.3k out) + judgment over retrieved evidence (4k in, 1.5k out) | Haiku | 0.002 |
| Fit check | Same, judged by Sonnet | Haiku + Sonnet | 0.024 |
| Adjustment | One call (6k in, 3k out) | Sonnet | 0.042 |
| Cover letter | Draft, review, edit; 8k prefix cached | Sonnet | 0.093 |
| Resume | 7 calls (strategist, review, editor, about two revision rounds, report); 9.5k prefix cached; 2.5k out each | Sonnet | 0.24 |
| Resume | Same | Opus | 0.46 |
| Interview turn | Topic gate (Haiku) + turn with 15k cached history, 0.7k out | Haiku + Sonnet | 0.011 |
| Interview, one position | About 30 turns + 1.5 extractions (20k in, 3k out) | Sonnet | 0.44 |
| Interview, eight positions | | Sonnet | 3.51 |

Thinking tokens are billed as output and are the largest uncertainty; the estimates assume moderate effort.

## Open points

- The value of one credit and the credits each action costs.
- Which models platform plans use for each action.
- Whether the career interview consumes credits.
- Fixed credits per action or metering by actual usage.
- Credits granted per plan and plan prices.
