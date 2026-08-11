import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { CollectionItem, Listing } from "@slabx/contracts";
import { catalogApi } from "./api/catalog";
import { listingApi } from "./api/listings";
import { offerApi } from "./api/offers";

const money = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
export function MarketplacePage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("newest");
  const [offers, setOffers] = useState(false);
  const listings = useQuery({
    queryKey: ["listings", q, sort, offers],
    queryFn: () =>
      listingApi.search({
        ...(q ? { q } : {}),
        sort,
        ...(offers ? { acceptsOffers: "true" } : {}),
      }),
  });
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">MARKETPLACE</p>
        <h1>Find your next card.</h1>
        <p>Search verified collector inventory with clear condition details.</p>
      </header>
      <div className="catalog-controls">
        <label className="form-field">
          <span>Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Player, character, set, or card number"
          />
        </label>
        <label className="form-field">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
        </label>
        <label className="check-field">
          <input
            type="checkbox"
            checked={offers}
            onChange={(e) => setOffers(e.target.checked)}
          />{" "}
          Accepting offers
        </label>
      </div>
      <div className="listing-grid">
        {listings.data?.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
      {listings.data?.length === 0 && (
        <p className="empty-state">No listings match those filters.</p>
      )}
    </main>
  );
}
function ListingCard({ listing }: { listing: Listing }) {
  const image = listing.item.media[0];
  return (
    <Link className="listing-card" to={`/marketplace/${listing.id}`}>
      {image ? (
        <img
          src={image.secureUrl.replace(
            "/upload/",
            "/upload/f_auto,q_auto,c_fill,w_640,h_800/",
          )}
          alt=""
        />
      ) : (
        <div className="listing-placeholder">SLABX</div>
      )}
      <div>
        <span>{listing.item.catalogCard.categoryName}</span>
        <h2>{listing.item.catalogCard.playerOrCharacter}</h2>
        <p>
          {listing.item.catalogCard.year} {listing.item.catalogCard.setName} #
          {listing.item.catalogCard.cardNumber}
        </p>
        <strong>{money(listing.priceMinor)}</strong>
        {listing.acceptsOffers && <em>Offers welcome</em>}
      </div>
    </Link>
  );
}
export function ListingDetailPage() {
  const { listingId = "" } = useParams();
  const client = useQueryClient();
  const listing = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => listingApi.get(listingId),
  });
  const watch = useMutation({
    mutationFn: () =>
      listing.data?.watched
        ? listingApi.unwatch(listingId)
        : listingApi.watch(listingId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["listing", listingId] });
    },
  });
  if (listing.isError) return <Navigate to="/marketplace" replace />;
  if (!listing.data)
    return <main className="catalog-page">Loading listing…</main>;
  const value = listing.data;
  return (
    <main id="main-content" className="catalog-page">
      <Link className="text-link" to="/marketplace">
        ← Marketplace
      </Link>
      <section className="listing-detail">
        <div className="detail-images">
          {value.item.media.map((image, i) => (
            <img
              key={image.id}
              src={image.secureUrl.replace(
                "/upload/",
                "/upload/f_auto,q_auto,w_1000/",
              )}
              alt={`${value.item.catalogCard.playerOrCharacter} ${i + 1}`}
            />
          ))}
        </div>
        <aside className="account-card">
          <p className="section-kicker">
            {value.item.catalogCard.categoryName}
          </p>
          <h1>{value.item.catalogCard.playerOrCharacter}</h1>
          <p>
            {value.item.catalogCard.year} {value.item.catalogCard.setName} #
            {value.item.catalogCard.cardNumber}
          </p>
          <h2>{money(value.priceMinor)}</h2>
          <strong>
            {value.item.conditionType === "GRADED"
              ? `${value.item.gradingCompany?.code} ${value.item.grade}`
              : value.item.rawCondition?.replaceAll("_", " ")}
          </strong>
          <p>{value.conditionDisclosure}</p>
          <p>
            Sold by <strong>@{value.seller.handle}</strong>
          </p>
          <button
            className="button button-primary"
            onClick={() => watch.mutate()}
          >
            {value.watched ? "Remove from watchlist" : "Watch this card"}
          </button>
          {value.status === "ACTIVE" && (
            <Link
              className="button button-primary"
              to={`/checkout/${value.id}`}
            >
              Buy now
            </Link>
          )}
          {value.acceptsOffers && <MakeOffer listingId={value.id} />}
        </aside>
      </section>
    </main>
  );
}

function MakeOffer({ listingId }: { listingId: string }) {
  const offer = useMutation({
    mutationFn: ({ amount, message }: { amount: number; message: string }) =>
      offerApi.create(listingId, Math.round(amount * 100), message),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    offer.mutate({
      amount: Number(data.get("amount")),
      message: String(data.get("message")),
    });
  }
  if (offer.isSuccess)
    return (
      <p className="offer-success">
        Offer sent. The seller has 24 hours to respond.{" "}
        <Link to="/offers">View negotiation</Link>
      </p>
    );
  return (
    <form className="offer-form" onSubmit={submit}>
      <h3>Make an offer</h3>
      <label className="form-field">
        <span>Offer amount (USD)</span>
        <input name="amount" type="number" min="1" step="0.01" required />
      </label>
      <label className="form-field">
        <span>Message (optional)</span>
        <input name="message" maxLength={500} />
      </label>
      <p className="image-guidance">
        Offers expire after 24 hours. You may cancel while the seller has not
        responded.
      </p>
      {offer.error && <p className="form-error">{offer.error.message}</p>}
      <button className="button button-secondary">Send offer</button>
    </form>
  );
}
export function SellPage() {
  const items = useQuery({
    queryKey: ["collection"],
    queryFn: catalogApi.collection,
    retry: false,
  });
  const create = useMutation({ mutationFn: listingApi.create });
  if (items.isError) return <Navigate to="/login" replace />;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    create.mutate({
      collectionItemId: String(data.get("item")),
      priceMinor: Math.round(Number(data.get("price")) * 100),
      currency: "USD",
      acceptsOffers: Boolean(data.get("offers")),
      minimumOfferMinor: data.get("minimum")
        ? Math.round(Number(data.get("minimum")) * 100)
        : null,
      conditionDisclosure: String(data.get("disclosure")),
    });
  }
  if (create.isSuccess) return <Navigate to="/selling" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">SELL</p>
        <h1>Create a listing.</h1>
        <p>Draft now, review it, and publish when you are ready.</p>
      </header>
      <form className="account-card auth-form compact-form" onSubmit={submit}>
        <label className="form-field">
          <span>Card from your collection</span>
          <select name="item" required>
            <option value="">Choose a card</option>
            {items.data?.map((item: CollectionItem) => (
              <option key={item.id} value={item.id}>
                {item.catalogCard.playerOrCharacter} · {item.catalogCard.year}{" "}
                {item.catalogCard.setName}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Price (USD)</span>
          <input name="price" type="number" min="1" step="0.01" required />
        </label>
        <label className="check-field">
          <input name="offers" type="checkbox" /> Accept offers
        </label>
        <label className="form-field">
          <span>Minimum offer (optional)</span>
          <input name="minimum" type="number" min="1" step="0.01" />
        </label>
        <label className="form-field">
          <span>Condition disclosure</span>
          <textarea
            name="disclosure"
            minLength={10}
            maxLength={2000}
            required
            placeholder="Describe corners, edges, surface, centering, and any defects."
          />
        </label>
        {create.error && <p className="form-error">{create.error.message}</p>}
        <p className="image-guidance">
          No listing fee. Draft marketplace fees will be shown before checkout
          in a later milestone.
        </p>
        <button className="button button-primary">Save draft</button>
      </form>
    </main>
  );
}
export function SellingPage() {
  const client = useQueryClient();
  const listings = useQuery({
    queryKey: ["my-listings"],
    queryFn: listingApi.mine,
    retry: false,
  });
  const action = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "publish" | "pause" | "resume";
    }) => listingApi.action(id, action),
    onSuccess: () => client.invalidateQueries({ queryKey: ["my-listings"] }),
  });
  if (listings.isError) return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">SELLER DASHBOARD</p>
        <h1>Your listings.</h1>
        <Link className="button button-primary" to="/sell">
          New listing
        </Link>
        <Link className="button button-secondary" to="/seller/onboarding">
          Payment setup
        </Link>
      </header>
      <div className="card-grid">
        {listings.data?.map((listing) => (
          <article className="catalog-card" key={listing.id}>
            <span>{listing.status}</span>
            <h2>{listing.item.catalogCard.playerOrCharacter}</h2>
            <strong>{money(listing.priceMinor)}</strong>
            <div className="listing-actions">
              {listing.status !== "ACTIVE" && listing.status !== "CLOSED" && (
                <button
                  onClick={() =>
                    action.mutate({
                      id: listing.id,
                      action:
                        listing.status === "PAUSED" ? "resume" : "publish",
                    })
                  }
                >
                  Publish
                </button>
              )}
              {listing.status === "ACTIVE" && (
                <button
                  onClick={() =>
                    action.mutate({ id: listing.id, action: "pause" })
                  }
                >
                  Pause
                </button>
              )}
              <Link to={`/marketplace/${listing.id}`}>View</Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
export function WatchlistPage() {
  const listings = useQuery({
    queryKey: ["watchlist"],
    queryFn: listingApi.watchlist,
    retry: false,
  });
  if (listings.isError) return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">WATCHLIST</p>
        <h1>Cards you’re watching.</h1>
      </header>
      <div className="listing-grid">
        {listings.data?.map((listing) => (
          <ListingCard key={listing.id} listing={listing} />
        ))}
      </div>
    </main>
  );
}
