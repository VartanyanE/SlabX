import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogPage } from "./CatalogPages";

afterEach(() => vi.restoreAllMocks());

describe("CatalogPage", () => {
  it("renders searchable canonical card results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      return new Response(
        JSON.stringify({
          data: url.includes("/categories")
            ? [{ id: "category-1", slug: "basketball", name: "Basketball" }]
            : [
                {
                  id: "card-1",
                  categoryName: "Basketball",
                  playerOrCharacter: "Victor Wembanyama",
                  year: 2023,
                  manufacturer: "Panini",
                  setName: "Prizm",
                  cardNumber: "136",
                  variant: "Silver",
                  isRookie: true,
                },
              ],
        }),
      );
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /find the card/i }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Victor Wembanyama")).toBeInTheDocument();
    expect(screen.getByText(/Silver/)).toBeInTheDocument();
  });
});
