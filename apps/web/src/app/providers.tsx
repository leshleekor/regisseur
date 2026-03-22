import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type JSX, type PropsWithChildren } from "react";

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

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
