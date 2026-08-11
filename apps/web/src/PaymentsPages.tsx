import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { paymentApi } from "./api/payments";

const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );

export function SellerOnboardingPage() {
  const [params] = useSearchParams();
  const client = useQueryClient();
  const account = useQuery({
    queryKey: ["payment-account"],
    queryFn: paymentApi.account,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: paymentApi.refresh,
    onSuccess: (data) => client.setQueryData(["payment-account"], data),
  });
  const onboard = useMutation({
    mutationFn: paymentApi.onboard,
    onSuccess: ({ url }) => window.location.assign(url),
  });
  useEffect(() => {
    if (params.has("returned") && !refresh.isPending) refresh.mutate();
  }, []);
  if (account.isError) return <Navigate to="/login" replace />;
  const value = account.data;
  return (
    <main id="main-content" className="catalog-page payment-page">
      <header className="catalog-heading">
        <p className="section-kicker">SELLER PAYMENTS</p>
        <h1>Get paid securely.</h1>
        <p>
          Stripe securely collects identity and bank information. SlabX never
          stores it.
        </p>
      </header>
      <section className="account-card payment-card">
        <span
          className={`payment-status payment-status-${value?.status.toLowerCase()}`}
        >
          {value?.status?.replaceAll("_", " ") ?? "LOADING"}
        </span>
        {value?.status === "ACTIVE" ? (
          <>
            <h2>You’re ready to sell.</h2>
            <p>Your account can accept payments and receive payouts.</p>
          </>
        ) : (
          <>
            <h2>Complete Stripe onboarding</h2>
            <p>
              You’ll leave SlabX briefly to verify your identity and connect a
              payout account.
            </p>
            {value?.requirementsCurrentlyDue.map((item) => (
              <small key={item}>{item.replaceAll("_", " ")}</small>
            ))}
            <button
              className="button button-primary"
              onClick={() => onboard.mutate()}
              disabled={onboard.isPending}
            >
              {value?.status === "NOT_STARTED"
                ? "Start secure onboarding"
                : "Continue onboarding"}
            </button>
          </>
        )}
        {(onboard.error || refresh.error) && (
          <p className="form-error">
            {(onboard.error ?? refresh.error)?.message}
          </p>
        )}
      </section>
    </main>
  );
}

export function CheckoutPage() {
  const { listingId = "" } = useParams();
  const [params] = useSearchParams();
  const offerThreadId = params.get("offer") ?? undefined;
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: paymentApi.addresses,
    retry: false,
  });
  const checkout = useMutation({
    mutationFn: (shippingAddressId: string) =>
      paymentApi.checkout({
        ...(offerThreadId ? { offerThreadId } : { listingId }),
        shippingAddressId,
      }),
    onSuccess: ({ checkoutUrl }) => window.location.assign(checkoutUrl),
  });
  if (addresses.isError) return <Navigate to="/login" replace />;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    checkout.mutate(String(new FormData(event.currentTarget).get("address")));
  }
  return (
    <main id="main-content" className="catalog-page payment-page">
      <header className="catalog-heading">
        <p className="section-kicker">SECURE CHECKOUT</p>
        <h1>Confirm your purchase.</h1>
        <p>The card is reserved for 30 minutes while you pay through Stripe.</p>
      </header>
      <form className="account-card auth-form" onSubmit={submit}>
        <h2>Shipping address</h2>
        {addresses.data?.map((address) => (
          <label className="address-choice" key={address.id}>
            <input
              type="radio"
              name="address"
              value={address.id}
              defaultChecked={address.isDefaultShipping}
              required
            />
            <span>
              <strong>{address.recipientName}</strong>
              <br />
              {address.line1}
              <br />
              {address.city}, {address.region} {address.postalCode}
            </span>
          </label>
        ))}
        {addresses.data?.length === 0 && (
          <p>
            Add a U.S. shipping address in{" "}
            <Link to="/account">account settings</Link> first.
          </p>
        )}
        <div className="fee-notice">
          <strong>No buyer marketplace fee</strong>
          <span>
            The seller pays SlabX’s 8% marketplace fee. Shipping and tax are not
            yet included in this test-mode milestone.
          </span>
        </div>
        {checkout.error && (
          <p className="form-error">{checkout.error.message}</p>
        )}
        <button
          className="button button-primary"
          disabled={!addresses.data?.length || checkout.isPending}
        >
          Continue to Stripe
        </button>
      </form>
    </main>
  );
}

export function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const orderId = params.get("order") ?? "";
  const cancelled = params.has("cancelled");
  const order = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => paymentApi.order(orderId),
    enabled: Boolean(orderId),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING_PAYMENT" ? 1500 : false,
  });
  return (
    <main id="main-content" className="catalog-page payment-page">
      <section className="account-card payment-card">
        <p className="section-kicker">CHECKOUT</p>
        <h1>
          {cancelled
            ? "Checkout paused."
            : order.data?.status === "PAID"
              ? "Payment confirmed."
              : "Confirming payment…"}
        </h1>
        <p>
          {cancelled
            ? "Your payment was not completed. The reservation remains available briefly if you want to try again."
            : order.data?.status === "PAID"
              ? `Order ${order.data.orderNumber} is confirmed. We’ll notify the seller.`
              : "Stripe is securely confirming your payment. This usually takes only a moment."}
        </p>
        <Link className="button button-primary" to="/orders">
          View orders
        </Link>
      </section>
    </main>
  );
}

export function OrdersPage() {
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: paymentApi.orders,
    retry: false,
  });
  if (orders.isError) return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="catalog-page payment-page">
      <header className="catalog-heading">
        <p className="section-kicker">ORDERS</p>
        <h1>Purchases and sales.</h1>
      </header>
      <div className="order-list">
        {orders.data?.map((order) => (
          <article className="account-card order-card" key={order.id}>
            {order.item.imageUrl && <img src={order.item.imageUrl} alt="" />}
            <div>
              <span
                className={`payment-status payment-status-${order.status.toLowerCase()}`}
              >
                {order.status.replaceAll("_", " ")}
              </span>
              <h2>{order.item.playerOrCharacter}</h2>
              <p>
                {order.item.year} {order.item.setName} #{order.item.cardNumber}
              </p>
              <strong>{money(order.subtotalMinor)}</strong>
              <small>{order.orderNumber}</small>
            </div>
          </article>
        ))}
      </div>
      {orders.data?.length === 0 && (
        <p className="empty-state">No orders yet.</p>
      )}
    </main>
  );
}
