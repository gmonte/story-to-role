# Encrypted opening fields are filtered and sorted in the service, not in SQL

An opening's company and title are encrypted with the user's key (privacy spec), so Postgres cannot filter, search or sort by them. The Openings page filters on the server (ADR 0013): the repository applies in SQL every filter on a structured column (board status, state, source, fit band, sent), and only when the filter, the free-text search or the sort needs the company or title, or a value code derives (the resume's origin), the service decrypts those fields for the rows SQL kept, filters and sorts them in memory, and returns the page with a cursor that carries the position. Without such a filter or sort, paging is the plain keyset of ADR 0013 and nothing is decrypted beyond the page.

The cost is bounded by one user's openings, tens to a few hundred; a user with thousands would make these filters slower, which is the point to revisit.

## Considered Options

- **A blind index** (an HMAC of the normalized company in its own column): filters by an exact company in SQL, but not by part of a name, not by title, and it cannot sort; it is also one more value derived from sensitive data, kept beside it.
- **Dropping text search and the company sort:** the filter would lose its most used field.
- **Decrypting everything for every request:** simpler, but pays the decryption even when no filter needs it.
