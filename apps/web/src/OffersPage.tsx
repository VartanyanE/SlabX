import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate } from "react-router";
import type { OfferThread } from "@slabx/contracts";
import { authApi } from "./api/auth";
import { offerApi } from "./api/offers";
const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
export function OffersPage() {
  const offers = useQuery({
    queryKey: ["offers"],
    queryFn: offerApi.list,
    retry: false,
  });
  const me = useQuery({ queryKey: ["me"], queryFn: authApi.me, retry: false });
  if (offers.isError) return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">OFFERS</p>
        <h1>Your negotiations.</h1>
        <p>Every offer and counteroffer stays in the timeline.</p>
      </header>
      <div className="offer-list">
        {offers.data?.map((thread) => (
          <OfferPanel
            key={thread.id}
            thread={thread}
            userId={me.data?.id ?? ""}
          />
        ))}
      </div>
      {offers.data?.length === 0 && (
        <p className="empty-state">No offers yet.</p>
      )}
    </main>
  );
}
function OfferPanel({
  thread,
  userId,
}: {
  thread: OfferThread;
  userId: string;
}) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const current = thread.revisions.at(-1);
  const isBuyer = userId === thread.buyerUserId;
  const awaiting = Boolean(
    current && current.actorUserId !== userId && thread.status === "OPEN",
  );
  const action = useMutation({
    mutationFn: (name: "accept" | "decline" | "cancel") =>
      offerApi.act(thread.id, name, thread.version),
    onSuccess: () => client.invalidateQueries({ queryKey: ["offers"] }),
    onError: (e) => setError(e.message),
  });
  const counter = useMutation({
    mutationFn: ({ amount, message }: { amount: number; message: string }) =>
      offerApi.counter(
        thread.id,
        Math.round(amount * 100),
        message,
        thread.version,
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["offers"] }),
    onError: (e) => setError(e.message),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    counter.mutate({
      amount: Number(data.get("amount")),
      message: String(data.get("message")),
    });
  }
  return (
    <article className="offer-panel">
      <div className="offer-heading">
        <div>
          <span>{thread.status}</span>
          <h2>{thread.listing.playerOrCharacter}</h2>
        </div>
        {thread.acceptedPriceMinor && (
          <strong>{money(thread.acceptedPriceMinor)}</strong>
        )}
      </div>
      <ol className="offer-timeline">
        {thread.revisions.map((revision, i) => (
          <li key={revision.id}>
            <span>
              {revision.actorUserId === thread.buyerUserId ? "Buyer" : "Seller"}{" "}
              {revision.kind.toLowerCase()}
            </span>
            <strong>{money(revision.amountMinor)}</strong>
            {revision.message && <p>{revision.message}</p>}
            <small>
              {i === thread.revisions.length - 1 && thread.status === "OPEN"
                ? `Expires ${new Date(revision.expiresAt).toLocaleString()}`
                : new Date(revision.createdAt).toLocaleString()}
            </small>
          </li>
        ))}
      </ol>
      {thread.status === "ACCEPTED" && (
        <p className="offer-success">
          Accepted. Checkout is reserved until{" "}
          {thread.checkoutExpiresAt
            ? new Date(thread.checkoutExpiresAt).toLocaleTimeString()
            : "soon"}
          .
        </p>
      )}
      {thread.status === "OPEN" && (
        <div className="offer-actions">
          {awaiting && (
            <>
              <button
                className="button button-primary"
                onClick={() => action.mutate("accept")}
              >
                Accept
              </button>
              <button
                className="button button-secondary"
                onClick={() => action.mutate("decline")}
              >
                Decline
              </button>
              <form onSubmit={submit}>
                <input
                  name="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="Counter amount"
                  required
                />
                <input
                  name="message"
                  maxLength={500}
                  placeholder="Optional message"
                />
                <button className="button button-secondary">Counter</button>
              </form>
            </>
          )}
          {isBuyer && current?.actorUserId === userId && (
            <button
              className="text-link"
              onClick={() => action.mutate("cancel")}
            >
              Cancel pending offer
            </button>
          )}
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
    </article>
  );
}
