import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddCollectionCardPage, CatalogPage } from "./CatalogPages";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

describe("AddCollectionCardPage", () => {
  it("collects card, copy, and photo details in one flow", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const data = url.includes("/categories")
        ? [{ id: "category-1", slug: "basketball", name: "Basketball" }]
        : url.includes("/grading-companies")
          ? [
              {
                id: "grader-1",
                code: "PSA",
                name: "Professional Sports Authenticator",
              },
            ]
          : url.includes("/catalog/sets")
            ? [
                {
                  id: "set-1",
                  categoryId: "category-1",
                  name: "Prizm",
                  yearStart: 2023,
                  manufacturer: "Panini",
                },
              ]
            : [];
      return new Response(JSON.stringify({ data }));
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter initialEntries={["/collection/add"]}>
          <AddCollectionCardPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: /add your card in one step/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByPlaceholderText("Example: Basketball"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Example: Prizm")).toBeInTheDocument();
    expect(screen.getByText("Card details")).toBeInTheDocument();
    expect(screen.getByText("Your copy")).toBeInTheDocument();
    expect(screen.getByText("Photos")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add to collection" }),
    ).toBeInTheDocument();
  });
});
