import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { Navigate, useParams } from "react-router";
import { trustApi } from "./api/trust";

export function ReputationPage() {
  const { userId = "" } = useParams();
  const trust = useQuery({
    queryKey: ["trust", userId],
    queryFn: () => trustApi.profile(userId),
  });
  if (trust.isError) return <Navigate to="/marketplace" replace />;
  const summary = trust.data?.summary;
  return (
    <main id="main-content" className="catalog-page trust-page">
      <header className="catalog-heading">
        <p className="section-kicker">VERIFIED REPUTATION</p>
        <h1>
          {summary?.ratingAverage
            ? `${summary.ratingAverage} / 5`
            : "New collector"}
        </h1>
        <p>{summary?.ratingCount ?? 0} transaction-backed reviews</p>
      </header>
      <section
        className="account-card rating-breakdown"
        aria-label="Rating breakdown"
      >
        {([5, 4, 3, 2, 1] as const).map((rating) => {
          const key = String(rating) as "1" | "2" | "3" | "4" | "5";
          const count = summary?.ratingBreakdown[key] ?? 0;
          return (
            <div key={rating}>
              <span>{rating} star</span>
              <progress
                max={Math.max(summary?.ratingCount ?? 0, 1)}
                value={count}
              />
              <strong>{count}</strong>
            </div>
          );
        })}
      </section>
      <div className="review-list">
        {trust.data?.reviews.map((review) => (
          <article className="account-card" key={review.id}>
            <strong>
              {"★".repeat(review.rating)}
              <span className="sr-only">{review.rating} out of 5</span>
            </strong>
            <small>Verified transaction</small>
            {review.comment && <p>{review.comment}</p>}
            <ReportForm targetType="REVIEW" targetId={review.id} />
          </article>
        ))}
      </div>
    </main>
  );
}

export function ReportForm({
  targetType,
  targetId,
}: {
  targetType: "USER" | "REVIEW" | "LISTING";
  targetId: string;
}) {
  const report = useMutation({
    mutationFn: (input: { reasonCode: string; details: string }) =>
      trustApi.report({ targetType, targetId, ...input }),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    report.mutate({
      reasonCode: String(data.get("reason")),
      details: String(data.get("details") ?? ""),
    });
  }
  if (report.isSuccess)
    return <p className="report-success">Report submitted for review.</p>;
  return (
    <details className="report-flow">
      <summary>Report</summary>
      <form onSubmit={submit}>
        <label>
          Reason
          <select name="reason" required>
            <option value="">Choose a reason</option>
            <option value="FRAUD">Fraud</option>
            <option value="COUNTERFEIT">Counterfeit concern</option>
            <option value="HARASSMENT">Harassment</option>
            <option value="SPAM">Spam</option>
            <option value="PRIVACY">Privacy</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label>
          Details
          <textarea name="details" maxLength={2000} required />
        </label>
        {report.error && <p className="form-error">{report.error.message}</p>}
        <button className="button button-secondary">Submit report</button>
      </form>
    </details>
  );
}

export function ModerationPage() {
  const client = useQueryClient();
  const reports = useQuery({
    queryKey: ["moderation-reports"],
    queryFn: trustApi.reports,
    retry: false,
  });
  const action = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: string }) =>
      trustApi.moderate(id, decision, "Reviewed through moderator queue."),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["moderation-reports"] }),
  });
  if (reports.isError) return <Navigate to="/" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">MODERATION</p>
        <h1>Trust and safety queue.</h1>
      </header>
      <div className="review-list">
        {reports.data?.map((report) => (
          <article className="account-card" key={report.id}>
            <span className="payment-status">
              {report.status.replaceAll("_", " ")}
            </span>
            <h2>{report.reasonCode.replaceAll("_", " ")}</h2>
            <p>
              {report.targetType} · {report.targetId}
            </p>
            {report.details && <p>{report.details}</p>}
            <div className="fulfillment-actions">
              <button
                className="button button-secondary"
                onClick={() =>
                  action.mutate({ id: report.id, decision: "DISMISS" })
                }
              >
                Dismiss
              </button>
              <button
                className="button button-primary"
                onClick={() =>
                  action.mutate({ id: report.id, decision: "RESOLVE" })
                }
              >
                Resolve
              </button>
              {report.targetType === "REVIEW" && (
                <button
                  className="button button-secondary"
                  onClick={() =>
                    action.mutate({ id: report.id, decision: "HIDE_REVIEW" })
                  }
                >
                  Hide review
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
