import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.string(),
  version: z.string(),
  timestamp: z.iso.datetime(),
  checks: z.record(z.string(), z.enum(["up", "down"])).optional(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim());
const passwordSchema = z.string().min(12).max(128);
export const handleSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[a-zA-Z0-9_]+$/);

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: handleSchema,
  displayName: z.string().trim().min(1).max(80),
});
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().max(128),
});
export const tokenRequestSchema = z.object({
  token: z.string().min(32).max(512),
});
export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(32).max(512),
  password: passwordSchema,
});

export const profileUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(40),
  recipientName: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(2).max(20),
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase()),
  isDefaultShipping: z.boolean().default(false),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type AddressInput = z.infer<typeof addressInputSchema>;

export type AuthenticatedUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  roles: string[];
  profile: { handle: string; displayName: string; bio: string | null };
};

export const catalogQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  year: z.coerce.number().int().min(1880).max(2100).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const catalogCardInputSchema = z.object({
  categoryId: z.uuid(),
  cardSetId: z.uuid(),
  playerOrCharacter: z.string().trim().min(1).max(120),
  year: z.number().int().min(1880).max(2100),
  cardNumber: z.string().trim().min(1).max(40),
  subset: z.string().trim().max(100).nullable().optional(),
  variant: z.string().trim().max(100).nullable().optional(),
  isRookie: z.boolean().default(false),
});

const collectionBaseSchema = z.object({
  catalogCardId: z.uuid(),
  itemNotes: z.string().trim().max(1000).nullable().optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).default("PRIVATE"),
  availabilityStatus: z
    .enum(["AVAILABLE", "NOT_FOR_SALE"])
    .default("NOT_FOR_SALE"),
  acquiredAt: z.iso.date().nullable().optional(),
  acquisitionPriceMinor: z.number().int().nonnegative().nullable().optional(),
});
export const collectionItemInputSchema = z.discriminatedUnion("conditionType", [
  collectionBaseSchema.extend({
    conditionType: z.literal("RAW"),
    rawCondition: z.enum([
      "POOR",
      "FAIR",
      "GOOD",
      "VERY_GOOD",
      "EXCELLENT",
      "NEAR_MINT",
      "MINT",
    ]),
  }),
  collectionBaseSchema.extend({
    conditionType: z.literal("GRADED"),
    gradingCompanyId: z.uuid(),
    grade: z.number().min(1).max(10),
    certificationNumber: z.string().trim().min(2).max(80),
  }),
]);
export const collectionQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  conditionType: z.enum(["RAW", "GRADED"]).optional(),
  visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type CatalogCardInput = z.infer<typeof catalogCardInputSchema>;
export type CollectionItemInput = z.infer<typeof collectionItemInputSchema>;
export type CollectionQuery = z.infer<typeof collectionQuerySchema>;

export const mediaConfirmationSchema = z.object({
  publicId: z.string().min(1).max(255),
});
export const mediaReorderSchema = z.object({
  mediaIds: z.array(z.uuid()).min(1).max(12),
});
export type MediaConfirmation = z.infer<typeof mediaConfirmationSchema>;
export type MediaReorder = z.infer<typeof mediaReorderSchema>;

export type MediaAsset = {
  id: string;
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  position: number;
  isPrimary: boolean;
  moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
};

export type SignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  publicId: string;
  signature: string;
  maxBytes: number;
  allowedFormats: string[];
};

const listingFields = {
  collectionItemId: z.uuid(),
  priceMinor: z.number().int().min(100).max(100_000_000),
  currency: z.literal("USD").default("USD"),
  acceptsOffers: z.boolean().default(false),
  minimumOfferMinor: z.number().int().positive().nullable().optional(),
  conditionDisclosure: z.string().trim().min(10).max(2000),
};
export const listingInputSchema = z
  .object(listingFields)
  .refine(
    (value) =>
      !value.minimumOfferMinor || value.minimumOfferMinor <= value.priceMinor,
    {
      message: "Minimum offer cannot exceed the listing price.",
    },
  );
export const listingUpdateSchema = z
  .object({
    priceMinor: listingFields.priceMinor,
    currency: listingFields.currency,
    acceptsOffers: listingFields.acceptsOffers,
    minimumOfferMinor: listingFields.minimumOfferMinor,
    conditionDisclosure: listingFields.conditionDisclosure,
    version: z.number().int().positive(),
  })
  .refine(
    (value) =>
      !value.minimumOfferMinor || value.minimumOfferMinor <= value.priceMinor,
    {
      message: "Minimum offer cannot exceed the listing price.",
    },
  );
export const listingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  graded: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  acceptsOffers: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListingInput = z.infer<typeof listingInputSchema>;
export type ListingUpdate = z.infer<typeof listingUpdateSchema>;
export type ListingQuery = z.infer<typeof listingQuerySchema>;
export type Listing = {
  id: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "RESERVED" | "CLOSED";
  priceMinor: number;
  currency: "USD";
  acceptsOffers: boolean;
  minimumOfferMinor: number | null;
  conditionDisclosure: string;
  publishedAt: string | null;
  version: number;
  watched: boolean;
  seller: {
    id: string;
    handle: string;
    displayName: string;
    ratingAverage: number | null;
    ratingCount: number;
  };
  item: CollectionItem;
};

export const offerCreateSchema = z.object({
  amountMinor: z.number().int().min(100).max(100_000_000),
  message: z.string().trim().max(500).nullable().optional(),
  idempotencyKey: z.string().uuid(),
});
export const offerCounterSchema = offerCreateSchema.extend({
  version: z.number().int().positive(),
});
export const offerActionSchema = z.object({
  version: z.number().int().positive(),
});
export type OfferCreate = z.infer<typeof offerCreateSchema>;
export type OfferCounter = z.infer<typeof offerCounterSchema>;
export type OfferAction = z.infer<typeof offerActionSchema>;
export type OfferRevision = {
  id: string;
  actorUserId: string;
  kind: "OFFER" | "COUNTER";
  amountMinor: number;
  message: string | null;
  expiresAt: string;
  createdAt: string;
};
export type OfferThread = {
  id: string;
  listingId: string;
  buyerUserId: string;
  sellerUserId: string;
  status: "OPEN" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  acceptedPriceMinor: number | null;
  checkoutExpiresAt: string | null;
  version: number;
  listing: {
    id: string;
    playerOrCharacter: string;
    priceMinor: number;
    status: string;
  };
  revisions: OfferRevision[];
};

export type CatalogCard = {
  id: string;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  cardSetId: string;
  setName: string;
  manufacturer: string;
  playerOrCharacter: string;
  year: number;
  cardNumber: string;
  subset: string | null;
  variant: string | null;
  isRookie: boolean;
  status: "PENDING_REVIEW" | "ACTIVE";
};

export type CollectionItem = {
  id: string;
  catalogCard: CatalogCard;
  conditionType: "RAW" | "GRADED";
  rawCondition: string | null;
  gradingCompany: { id: string; code: string; name: string } | null;
  grade: number | null;
  certificationNumber: string | null;
  itemNotes: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  availabilityStatus: string;
  acquiredAt: string | null;
  acquisitionPriceMinor: number | null;
  version: number;
  media: MediaAsset[];
};
