import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, type FormEvent, useState } from "react";
import type { CollectionItem } from "@slabx/contracts";
import { Link, Navigate, useParams } from "react-router";
import { catalogApi, uploadToCloudinary } from "./api/catalog";

export function CatalogPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: catalogApi.categories,
  });
  const cards = useQuery({
    queryKey: ["catalog", search, category],
    queryFn: () =>
      catalogApi.search({
        ...(search ? { q: search } : {}),
        ...(category ? { category } : {}),
      }),
  });
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">CARD CATALOG</p>
        <h1>Find the card. Track your copy.</h1>
        <p>
          Search SlabX’s canonical card catalog across sports and trading card
          games.
        </p>
      </header>
      <div className="catalog-controls">
        <label className="form-field">
          <span>Search</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Player, character, set, or number"
          />
        </label>
        <label className="form-field">
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.data?.map((item) => (
              <option key={item.id} value={item.slug}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {cards.isLoading && <p>Searching catalog…</p>}
      <div className="card-grid">
        {cards.data?.map((card) => (
          <Link
            className="catalog-card"
            key={card.id}
            to={`/catalog/${card.id}`}
          >
            <span>{card.categoryName}</span>
            <h2>{card.playerOrCharacter}</h2>
            <p>
              {card.year} {card.manufacturer} {card.setName}
            </p>
            <strong>
              #{card.cardNumber}
              {card.variant ? ` · ${card.variant}` : ""}
            </strong>
            {card.isRookie && <em>Rookie</em>}
          </Link>
        ))}
      </div>
      {cards.data?.length === 0 && (
        <p className="empty-state">No matching cards yet.</p>
      )}
      <MissingCardForm categories={categories.data ?? []} />
    </main>
  );
}

function MissingCardForm({
  categories,
}: {
  categories: { id: string; slug: string; name: string }[];
}) {
  const [categoryId, setCategoryId] = useState("");
  const sets = useQuery({
    queryKey: ["card-sets", categoryId],
    queryFn: () => catalogApi.sets(categoryId),
    enabled: Boolean(categoryId),
  });
  const mutation = useMutation({ mutationFn: catalogApi.createCard });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.mutate({
      categoryId,
      cardSetId: String(data.get("cardSetId")),
      playerOrCharacter: String(data.get("playerOrCharacter")),
      year: Number(data.get("year")),
      cardNumber: String(data.get("cardNumber")),
      variant: String(data.get("variant")) || null,
      isRookie: Boolean(data.get("isRookie")),
    });
  }
  return (
    <details className="missing-card">
      <summary>Can’t find your card?</summary>
      {mutation.isSuccess ? (
        <p>
          Submitted for catalog review. You can still{" "}
          <Link to={`/catalog/${mutation.data.id}`}>add your copy now</Link>.
        </p>
      ) : (
        <form className="auth-form compact-form" onSubmit={submit}>
          <label className="form-field">
            <span>Category</span>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
            >
              <option value="">Choose category</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Set</span>
            <select name="cardSetId" required disabled={!categoryId}>
              <option value="">Choose set</option>
              {sets.data?.map((set) => (
                <option key={set.id} value={set.id}>
                  {set.yearStart} {set.manufacturer} {set.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Player or character</span>
            <input name="playerOrCharacter" required />
          </label>
          <label className="form-field">
            <span>Year</span>
            <input name="year" type="number" min="1880" max="2100" required />
          </label>
          <label className="form-field">
            <span>Card number</span>
            <input name="cardNumber" required />
          </label>
          <label className="form-field">
            <span>Variant</span>
            <input name="variant" />
          </label>
          <label className="check-field">
            <input type="checkbox" name="isRookie" /> Rookie card
          </label>
          {mutation.error && (
            <p className="form-error">{mutation.error.message}</p>
          )}
          <button
            className="button button-primary"
            disabled={mutation.isPending}
          >
            Submit card
          </button>
        </form>
      )}
    </details>
  );
}

export function CatalogCardPage() {
  const { cardId = "" } = useParams();
  const card = useQuery({
    queryKey: ["catalog-card", cardId],
    queryFn: () => catalogApi.card(cardId),
  });
  if (card.isLoading)
    return (
      <main className="catalog-page">
        <p>Loading card…</p>
      </main>
    );
  if (card.isError) return <Navigate to="/catalog" replace />;
  const value = card.data!;
  return (
    <main id="main-content" className="catalog-page">
      <Link className="text-link" to="/catalog">
        ← Catalog
      </Link>
      <section className="card-detail">
        <div>
          <p className="section-kicker">{value.categoryName}</p>
          <h1>{value.playerOrCharacter}</h1>
          <p>
            {value.year} {value.manufacturer} {value.setName} · #
            {value.cardNumber}
          </p>
          {value.variant && <strong>{value.variant}</strong>}
        </div>
        <AddToCollection cardId={value.id} />
      </section>
    </main>
  );
}

function AddToCollection({ cardId }: { cardId: string }) {
  const [condition, setCondition] = useState<"RAW" | "GRADED">("RAW");
  const graders = useQuery({
    queryKey: ["graders"],
    queryFn: catalogApi.graders,
  });
  const mutation = useMutation({ mutationFn: catalogApi.createItem });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const base = {
      catalogCardId: cardId,
      itemNotes: String(data.get("notes")) || null,
      visibility: data.get("public")
        ? ("PUBLIC" as const)
        : ("PRIVATE" as const),
      availabilityStatus: "NOT_FOR_SALE" as const,
    };
    mutation.mutate(
      condition === "RAW"
        ? {
            ...base,
            conditionType: "RAW",
            rawCondition: String(data.get("rawCondition")) as "NEAR_MINT",
          }
        : {
            ...base,
            conditionType: "GRADED",
            gradingCompanyId: String(data.get("gradingCompanyId")),
            grade: Number(data.get("grade")),
            certificationNumber: String(data.get("certificationNumber")),
          },
    );
  }
  if (mutation.isSuccess)
    return (
      <div className="account-card">
        <h2>Added to your collection</h2>
        <Link className="button button-primary" to="/collection">
          View collection
        </Link>
      </div>
    );
  return (
    <form className="account-card auth-form" onSubmit={submit}>
      <h2>Add your copy</h2>
      <label className="form-field">
        <span>Condition type</span>
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value as "RAW" | "GRADED")}
        >
          <option value="RAW">Raw</option>
          <option value="GRADED">Graded</option>
        </select>
      </label>
      {condition === "RAW" ? (
        <label className="form-field">
          <span>Condition</span>
          <select name="rawCondition">
            <option value="NEAR_MINT">Near Mint</option>
            <option value="MINT">Mint</option>
            <option value="EXCELLENT">Excellent</option>
            <option value="VERY_GOOD">Very Good</option>
            <option value="GOOD">Good</option>
            <option value="FAIR">Fair</option>
            <option value="POOR">Poor</option>
          </select>
        </label>
      ) : (
        <>
          <label className="form-field">
            <span>Grading company</span>
            <select name="gradingCompanyId" required>
              {graders.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.code} — {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Grade</span>
            <input
              name="grade"
              type="number"
              min="1"
              max="10"
              step="0.5"
              required
            />
          </label>
          <label className="form-field">
            <span>Certification number</span>
            <input name="certificationNumber" required />
          </label>
        </>
      )}
      <label className="form-field">
        <span>Notes</span>
        <textarea name="notes" maxLength={1000} />
      </label>
      <label className="check-field">
        <input name="public" type="checkbox" /> Show this item publicly
      </label>
      {mutation.error && <p className="form-error">{mutation.error.message}</p>}
      <button className="button button-primary" disabled={mutation.isPending}>
        Add to collection
      </button>
    </form>
  );
}

export function CollectionPage() {
  const client = useQueryClient();
  const items = useQuery({
    queryKey: ["collection"],
    queryFn: catalogApi.collection,
    retry: false,
  });
  const remove = useMutation({
    mutationFn: catalogApi.deleteItem,
    onSuccess: () => client.invalidateQueries({ queryKey: ["collection"] }),
  });
  if (items.isError) return <Navigate to="/login" replace />;
  return (
    <main id="main-content" className="catalog-page">
      <header className="catalog-heading">
        <p className="section-kicker">MY COLLECTION</p>
        <h1>Your cards, copy by copy.</h1>
        <Link className="button button-primary" to="/catalog">
          Add a card
        </Link>
      </header>
      <div className="card-grid">
        {items.data?.map((item) => (
          <article className="catalog-card" key={item.id}>
            <span>
              {item.catalogCard.categoryName} · {item.visibility}
            </span>
            <h2>{item.catalogCard.playerOrCharacter}</h2>
            <p>
              {item.catalogCard.year} {item.catalogCard.setName} #
              {item.catalogCard.cardNumber}
            </p>
            <strong>
              {item.conditionType === "GRADED"
                ? `${item.gradingCompany?.code} ${item.grade}`
                : item.rawCondition?.replaceAll("_", " ")}
            </strong>
            <ImageManager item={item} />
            <button
              className="text-link"
              onClick={() => remove.mutate(item.id)}
            >
              Remove
            </button>
          </article>
        ))}
      </div>
      {items.data?.length === 0 && (
        <p className="empty-state">
          Your collection is ready for its first card.
        </p>
      )}
    </main>
  );
}

function ImageManager({ item }: { item: CollectionItem }) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const busy = progress !== null;
  const media = item.media ?? [];
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError("");
    try {
      for (const file of files) {
        const signed = await catalogApi.signUpload(item.id);
        if (file.size > signed.maxBytes)
          throw new Error("Each image must be under 12 MB.");
        const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!signed.allowedFormats.includes(extension))
          throw new Error("Choose a JPG, PNG, WebP, or HEIC image.");
        setProgress(0);
        const uploaded = await uploadToCloudinary(signed, file, setProgress);
        await catalogApi.confirmUpload(item.id, uploaded.public_id);
      }
      await client.invalidateQueries({ queryKey: ["collection"] });
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Image upload failed. Please retry.",
      );
    } finally {
      setProgress(null);
    }
  }
  async function move(index: number, direction: -1 | 1) {
    const next = [...media];
    const target = index + direction;
    if (!next[target]) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    await catalogApi.reorderMedia(
      item.id,
      next.map((image) => image.id),
    );
    await client.invalidateQueries({ queryKey: ["collection"] });
  }
  async function remove(mediaId: string) {
    await catalogApi.deleteMedia(item.id, mediaId);
    await client.invalidateQueries({ queryKey: ["collection"] });
  }
  return (
    <section
      className="image-manager"
      aria-label={`Images for ${item.catalogCard.playerOrCharacter}`}
    >
      <div className="item-images">
        {media.map((image, index) => (
          <figure key={image.id} className="item-image">
            <img
              src={image.secureUrl.replace(
                "/upload/",
                "/upload/f_auto,q_auto,c_fill,w_640,h_800/",
              )}
              alt={`${item.catalogCard.playerOrCharacter} collectible ${index + 1}`}
            />
            {image.isPrimary && <figcaption>Primary</figcaption>}
            <div className="image-actions">
              <button
                type="button"
                aria-label="Move image left"
                disabled={index === 0}
                onClick={() => void move(index, -1)}
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Move image right"
                disabled={index === media.length - 1}
                onClick={() => void move(index, 1)}
              >
                →
              </button>
              <button type="button" onClick={() => void remove(image.id)}>
                Delete
              </button>
            </div>
          </figure>
        ))}
      </div>
      <label className="image-picker button button-secondary">
        {busy
          ? `Uploading ${progress}%`
          : media.length
            ? "Add more photos"
            : "Add photos"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          disabled={busy || media.length >= 12}
          onChange={(event) => void choose(event)}
        />
      </label>
      <p className="image-guidance">
        Front first, then back and details. Use bright, even light.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error} <span>Choose the file again to retry.</span>
        </p>
      )}
    </section>
  );
}
