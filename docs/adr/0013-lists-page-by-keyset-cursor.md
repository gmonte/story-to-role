# Lists that grow page by a keyset cursor, loaded as infinite queries

Any list whose length grows with use (usage operations, admin users, openings) is paged on the server and loaded a page at a time as it scrolls. A procedure's input carries `paginationParamsSchema` (`cursor`, `limit`) beside its own filters, and its output is `createPaginationOutputSchema`: `{ data, nextCursor, total }`, where `total` counts every row the filters match, ignoring the cursor (`packages/api/src/utils/schemas/pagination.ts`). The cursor is a keyset: the last row's sort key and its id, compared in SQL (`(key, id) < (cursor.key, cursor.id)`), so pages stay stable while rows are added. On the web, a hook passes `trpc.x.y.infiniteQueryOptions(input, cursorPageParams)` to `useInfiniteCursorQuery`, which flattens the pages into `rows`, and `InfiniteScroll` (`@repo/web/components/pagination/infinite-scroll`) asks for the next page when its sentinel comes into view. A board with columns runs one infinite query per column, each scrolling inside its column.

The exception is a sort or filter on a value SQL cannot see, such as an encrypted field (ADR 0014): the service orders the rows itself, and the cursor, still opaque to the client, carries the position.

## Considered Options

- **Offset pagination (`limit`/`offset`):** a row added or moved while the user scrolls shifts every later page, so rows repeat or go missing, and deep pages scan everything before them.
- **Numbered pages:** a page bar suits a report, not the lists here, which are read from the top and scrolled; it also needs the offset above.
- **Loading the whole list and filtering on the client:** what the tracker did. Simple while lists are short, but every filter change and every page keeps all rows in memory, and the payload grows with the user's history.
