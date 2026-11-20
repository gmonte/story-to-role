import { z } from "zod";

/** Default page size for cursor-based infinite lists. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The paging envelope every cursor-infinite input carries, alongside its own
 * filters. `cursor` and `direction` are injected by react-query's infinite
 * queries (@trpc/tanstack-react-query passes both); lists here only page
 * forward, so `direction` is accepted and ignored.
 */
export const paginationParamsSchema = z.object({
  cursor: z.string().nullish(),
  direction: z.enum(["forward", "backward"]).optional(),
  limit: z.number().int().min(1).max(100).optional().default(DEFAULT_PAGE_SIZE),
});

/**
 * The paging knobs a list hook drives itself; subtract them from a
 * procedure's input to get the filters a caller may pass.
 */
export type PaginationParamKeys = keyof z.infer<typeof paginationParamsSchema>;

export const createPaginationOutputSchema = <TDataSchema extends z.ZodType>({
  dataSchema,
}: {
  dataSchema: TDataSchema;
}) =>
  z.object({
    data: z.array(dataSchema),
    // Cursor for the next page, or null when the list is exhausted.
    nextCursor: z.string().nullable(),
    // Every row matching the filters, ignoring the cursor.
    total: z.number().int(),
  });
