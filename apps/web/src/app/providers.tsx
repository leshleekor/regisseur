import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX, type PropsWithChildren } from "react";

import { FeedbackProvider } from "@/components/app/feedback";

export function AppProviders({ children }: PropsWithChildren): JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            staleTime: 5_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>{children}</FeedbackProvider>
    </QueryClientProvider>
  );
}
