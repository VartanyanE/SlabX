import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { Navigate } from "react-router";
import { financialApi } from "./api/financial";

const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
export function RefundQueuePage() {
  const client = useQueryClient();
  const refunds = useQuery({
    queryKey: ["refunds"],
    queryFn: financialApi.refunds,
    retry: false,
  });
  const overview = useQuery({
    queryKey: ["financial-overview"],
    queryFn: financialApi.overview,
    retry: false,
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: string;
      decision: "APPROVE" | "REJECT";
    }) => financialApi.decide(id, decision),
    onSuccess: () => client.invalidateQueries({ queryKey: ["refunds"] }),
  });
  if (refunds.isError) return <Navigate to="/" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">FINANCIAL OPERATIONS</p>
        <h1>Refund and reconciliation queue.</h1>
        <p>
          Every approval reverses seller funds and creates compensating ledger
          records.
        </p>
      </header>
      <section className="feature-grid financial-metrics">
        <article>
          <span>REFUNDS</span>
          <h2>{overview.data?.openRefunds ?? 0}</h2>
          <p>Requests requiring attention</p>
        </article>
        <article>
          <span>DISPUTES</span>
          <h2>{overview.data?.openDisputes ?? 0}</h2>
          <p>Open Stripe cases</p>
        </article>
        <article>
          <span>ACTIVE HOLDS</span>
          <h2>{money(overview.data?.activeHoldsMinor ?? 0)}</h2>
          <p>Seller funds held for risk</p>
        </article>
        <article>
          <span>DIFFERENCES</span>
          <h2>{money(overview.data?.reconciliationDifferenceMinor ?? 0)}</h2>
          <p>Unreconciled provider variance</p>
        </article>
      </section>
      <section className="financial-columns">
        <div>
          <h2>Disputes</h2>
          {overview.data?.disputes.map((dispute) => (
            <article className="account-card" key={dispute.id}>
              <span className="payment-status">
                {dispute.status.replaceAll("_", " ")}
              </span>
              <strong>{money(dispute.amountMinor)}</strong>
              <p>{dispute.reason.replaceAll("_", " ")}</p>
              {dispute.evidenceDueAt && (
                <small>
                  Evidence due{" "}
                  {new Date(dispute.evidenceDueAt).toLocaleDateString()}
                </small>
              )}
            </article>
          ))}
        </div>
        <div>
          <h2>Payout holds</h2>
          {overview.data?.holds.map((hold) => (
            <article className="account-card" key={hold.id}>
              <span className="payment-status">{hold.status}</span>
              <strong>{money(hold.amountMinor)}</strong>
              <p>{hold.reasonCode.replaceAll("_", " ")}</p>
            </article>
          ))}
        </div>
      </section>
      {Boolean(overview.data?.differences.length) && (
        <section>
          <h2>Reconciliation differences</h2>
          <div className="review-list">
            {overview.data?.differences.map((difference) => (
              <article className="account-card" key={difference.id}>
                <strong>
                  {money(Math.abs(difference.differenceMinor))} variance
                </strong>
                <p>
                  {difference.providerType} · {difference.providerId}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
      <h2>Refund requests</h2>
      <div className="review-list">
        {refunds.data?.map((refund) => (
          <article className="account-card" key={refund.id}>
            <span className="payment-status">{refund.status}</span>
            <h2>{money(refund.amountMinor)}</h2>
            <strong>{refund.reasonCode.replaceAll("_", " ")}</strong>
            <p>{refund.details}</p>
            {refund.failureMessage && (
              <p className="form-error">{refund.failureMessage}</p>
            )}
            {["REQUESTED", "FAILED"].includes(refund.status) && (
              <div className="fulfillment-actions">
                <button
                  className="button button-secondary"
                  onClick={() =>
                    decide.mutate({ id: refund.id, decision: "REJECT" })
                  }
                >
                  Reject
                </button>
                <button
                  className="button button-primary"
                  onClick={() =>
                    decide.mutate({ id: refund.id, decision: "APPROVE" })
                  }
                >
                  Approve refund
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}

export function SellerBalancePage() {
  const summary = useQuery({
    queryKey: ["seller-financial-summary"],
    queryFn: financialApi.sellerSummary,
    retry: false,
  });
  if (summary.isError) return <Navigate to="/login" replace />;
  const value = summary.data;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">SELLER FINANCES</p>
        <h1>Your proceeds and payouts.</h1>
        <p>Provider-confirmed payout status and SlabX risk holds.</p>
      </header>
      <section className="feature-grid financial-metrics">
        <article>
          <span>LIFETIME PROCEEDS</span>
          <h2>{money(value?.lifetimeProceedsMinor ?? 0)}</h2>
        </article>
        <article>
          <span>REFUND REVERSALS</span>
          <h2>{money(value?.refundedMinor ?? 0)}</h2>
        </article>
        <article>
          <span>ACTIVE HOLDS</span>
          <h2>{money(value?.activeHoldsMinor ?? 0)}</h2>
        </article>
        <article>
          <span>PAID OUT</span>
          <h2>{money(value?.paidOutMinor ?? 0)}</h2>
        </article>
      </section>
      <h2>Payout history</h2>
      <div className="review-list">
        {value?.payouts.map((payout) => (
          <article className="account-card" key={payout.id}>
            <span className="payment-status">
              {payout.status.replaceAll("_", " ")}
            </span>
            <strong>{money(payout.amountMinor)}</strong>
            <small>
              {payout.arrivalAt
                ? `Expected ${new Date(payout.arrivalAt).toLocaleDateString()}`
                : new Date(payout.createdAt).toLocaleDateString()}
            </small>
          </article>
        ))}
      </div>
      {value?.payouts.length === 0 && (
        <p className="empty-state">No Stripe payouts recorded yet.</p>
      )}
    </main>
  );
}

export function RefundRequestForm({
  orderId,
  maxMinor,
}: {
  orderId: string;
  maxMinor: number;
}) {
  const request = useMutation({
    mutationFn: (input: {
      amountMinor: number;
      reasonCode: string;
      details: string;
    }) => financialApi.request({ orderId, ...input }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    request.mutate({
      amountMinor: Math.round(Number(data.get("amount")) * 100),
      reasonCode: String(data.get("reason")),
      details: String(data.get("details")),
    });
  }
  if (request.isSuccess)
    return (
      <p className="offer-success">
        Refund request submitted. SlabX support will review it.
      </p>
    );
  return (
    <details className="report-flow">
      <summary>Request a refund</summary>
      <form onSubmit={submit}>
        <label>
          Amount (up to {money(maxMinor)})
          <input
            name="amount"
            type="number"
            min="0.01"
            max={(maxMinor / 100).toFixed(2)}
            step="0.01"
            required
          />
        </label>
        <label>
          Reason
          <select name="reason" required>
            <option value="">Choose a reason</option>
            <option value="NOT_AS_DESCRIBED">Not as described</option>
            <option value="DAMAGED">Damaged</option>
            <option value="COUNTERFEIT">Counterfeit concern</option>
            <option value="NOT_RECEIVED">Not received</option>
            <option value="AGREED_RETURN">Agreed return</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Details
          <textarea name="details" minLength={10} maxLength={2000} required />
        </label>
        {request.error && <p className="form-error">{request.error.message}</p>}
        <button className="button button-secondary">Submit request</button>
      </form>
    </details>
  );
}
