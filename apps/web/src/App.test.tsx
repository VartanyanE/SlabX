import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("renders the mobile-first platform shell", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "ok",
          service: "slabx-api",
          version: "0.1.0",
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /great cards deserve/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Platform online")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
  });
});
