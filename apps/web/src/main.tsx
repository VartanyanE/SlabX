import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) =>
        navigator.onLine && failureCount < 2 && !(error instanceof TypeError),
      refetchOnReconnect: true,
    },
  },
});

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("SlabX application error", error, info.componentStack);
  }

  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error" id="main-content">
          <p className="section-kicker">RECOVERY MODE</p>
          <h1>Something didn’t load correctly.</h1>
          <p>Your account and transaction data are safe.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload SlabX
          </button>
        </main>
      );
    return this.props.children;
  }
}
const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
