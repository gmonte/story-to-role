# Local embeddings and a hybrid fit check

Embeddings are part of the MVP and are computed by a local multilingual model running in a Trigger.dev task, stored with pgvector in Postgres, so no AI vendor receives career text for them and BYOK users with providers that lack embeddings (such as Anthropic) need nothing extra. The vectors are of the published profile's passages (recomputed on publish, only for what changed), of documents and of openings. Vectors only retrieve: each opening keyword and requirement fetches the closest profile passages, and a cheap model judges each one as met, partial or a gap, seeing only what was retrieved, the profile's overview (each position's title, employer and period, credentials and languages, from which years and seniority are read), the profile's declared gaps and the user's job preferences. The opening gets the method's band (high, medium or low), each requirement linked to the passage that backs it: without a passage, a verdict is an opinion.

## Considered Options

- **Vector similarity alone as the verdict:** free, but it misses seniority ("8+ years" against a junior history reads as similar) and hard requirements such as location or language, and cannot explain gaps.
- **Embedding APIs (OpenAI, Voyage):** negligible cost, but another subprocessor receiving resumes under the LGPD, another key, and re-embedding everything when the model changes.
- **AI-only fit check without vectors:** sends the whole profile to the model on each opening; more tokens and a less precise choice of passages.

## Consequences

- A competency marked "studied", anything under "what I did not do" and the known gaps count as gaps, never as coverage.
