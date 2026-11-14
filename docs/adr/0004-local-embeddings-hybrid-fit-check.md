# Local embeddings and a hybrid fit check

Embeddings are part of the MVP and are computed by a local multilingual model running in a Trigger.dev task, stored with pgvector in Postgres, so no AI vendor receives career text for them and BYOK users with providers that lack embeddings (such as Anthropic) need nothing extra. Vectors only retrieve: each opening keyword and requirement fetches the closest evidence, and a cheap model judges each one as met, partial or a gap, seeing only what was retrieved.

## Considered Options

- **Vector similarity alone as the verdict:** free, but it misses seniority ("8+ years" against a junior history reads as similar) and hard requirements such as location or language, and cannot explain gaps.
- **Embedding APIs (OpenAI, Voyage):** negligible cost, but another subprocessor receiving resumes under the LGPD, another key, and re-embedding everything when the model changes.
- **AI-only fit check without vectors:** sends skills and every position summary to the model on each opening; more tokens and less precise selection of evidence.
