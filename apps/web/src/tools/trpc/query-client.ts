import {
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

export const createQueryClient = () => {
  const queryClient: QueryClient = new QueryClient({
    // Any mutation may start a task, and with it a reservation: the
    // credit meter refreshes after each one.
    mutationCache: new MutationCache({
      onSettled: () =>
        queryClient.invalidateQueries({ queryKey: [["credits", "summary"]] }),
    }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
  return queryClient;
};
