import cookieParser from "cookie-parser";
import { Router, type RequestHandler, type Response } from "express";
import type { ZodType } from "zod";
import {
  catalogCardInputSchema,
  catalogQuerySchema,
  collectionItemInputSchema,
  collectionQuerySchema,
  mediaConfirmationSchema,
  mediaReorderSchema,
  manualCatalogCardInputSchema,
} from "@slabx/contracts";
import { IdentityService } from "../identity/service.js";
import { MediaService } from "../media/service.js";
import { CatalogError, CatalogService } from "./service.js";

const SESSION_COOKIE = "slabx_session";
export function createCatalogRouter(options: {
  service: CatalogService;
  identity: IdentityService;
  media?: MediaService;
}): Router {
  const router = Router();
  router.use(cookieParser());
  const requireAuth: RequestHandler = async (request, response, next) => {
    const session = await options.identity.authenticate(
      request.cookies[SESSION_COOKIE],
    );
    if (!session)
      return error(response, 401, "AUTHENTICATION_REQUIRED", "Please sign in.");
    response.locals.session = session;
    response.locals.user = session.user;
    next();
  };
  const requireCsrf: RequestHandler = (request, response, next) => {
    if (
      !options.identity.validateCsrf(
        request.get("x-csrf-token"),
        response.locals.session.csrfTokenHash,
      )
    )
      return error(
        response,
        403,
        "CSRF_INVALID",
        "Refresh the page and try again.",
      );
    next();
  };
  router.get("/categories", async (req, res) =>
    res.json({
      data: await options.service.categories(),
      meta: { requestId: req.id },
    }),
  );
  router.get("/grading-companies", async (req, res) =>
    res.json({
      data: await options.service.gradingCompanies(),
      meta: { requestId: req.id },
    }),
  );
  router.get("/catalog/sets", async (req, res) =>
    res.json({
      data: await options.service.cardSets(
        typeof req.query.categoryId === "string"
          ? req.query.categoryId
          : undefined,
      ),
      meta: { requestId: req.id },
    }),
  );
  router.get("/catalog/cards", async (req, res) => {
    try {
      const result = await options.service.searchCards(
        parse(catalogQuerySchema, req.query),
      );
      res.json({
        data: result.data,
        meta: { requestId: req.id, nextCursor: result.nextCursor },
      });
    } catch (e) {
      handle(e, res);
    }
  });
  router.get("/catalog/cards/:cardId", async (req, res) => {
    const card = await options.service.getCard(String(req.params.cardId));
    if (!card) return error(res, 404, "NOT_FOUND", "Card not found.");
    res.json({ data: card, meta: { requestId: req.id } });
  });
  router.post("/catalog/cards", requireAuth, requireCsrf, async (req, res) => {
    try {
      const card = await options.service.createCard(
        res.locals.user.id,
        parse(catalogCardInputSchema, req.body),
      );
      res.status(201).json({ data: card, meta: { requestId: req.id } });
    } catch (e) {
      handle(e, res);
    }
  });
  router.post(
    "/catalog/cards/manual",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      try {
        const card = await options.service.createManualCard(
          res.locals.user.id,
          parse(manualCatalogCardInputSchema, req.body),
        );
        res.status(201).json({ data: card, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.get("/me/collection/items", requireAuth, async (req, res) => {
    try {
      const result = await options.service.listItems(
        res.locals.user.id,
        parse(collectionQuerySchema, req.query),
      );
      res.json({
        data: result.data,
        meta: { requestId: req.id, nextCursor: result.nextCursor },
      });
    } catch (e) {
      handle(e, res);
    }
  });
  router.post(
    "/collection/items",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      try {
        const item = await options.service.createItem(
          res.locals.user.id,
          parse(collectionItemInputSchema, req.body),
        );
        res.status(201).json({ data: item, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.get("/collection/items/:itemId", async (req, res) => {
    const session = await options.identity.authenticate(
      req.cookies[SESSION_COOKIE],
    );
    const item = await options.service.getItem(
      String(req.params.itemId),
      session?.user.id,
    );
    if (!item)
      return error(res, 404, "NOT_FOUND", "Collection item not found.");
    res.json({ data: item, meta: { requestId: req.id } });
  });
  router.patch(
    "/collection/items/:itemId",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      try {
        const item = await options.service.updateItem(
          res.locals.user.id,
          String(req.params.itemId),
          parse(collectionItemInputSchema, req.body),
        );
        if (!item)
          return error(
            res,
            404,
            "NOT_FOUND",
            "Collection item not found or locked.",
          );
        res.json({ data: item, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.delete(
    "/collection/items/:itemId",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      const removed = await options.service.deleteItem(
        res.locals.user.id,
        String(req.params.itemId),
      );
      if (!removed)
        return error(
          res,
          404,
          "NOT_FOUND",
          "Collection item not found or locked.",
        );
      res.status(204).end();
    },
  );
  router.post(
    "/collection/items/:itemId/media/sign",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      if (!options.media)
        return error(
          res,
          503,
          "MEDIA_UNAVAILABLE",
          "Image uploads are not configured.",
        );
      try {
        const data = await options.media.sign(
          res.locals.user.id,
          String(req.params.itemId),
        );
        res.json({ data, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.post(
    "/collection/items/:itemId/media/confirm",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      if (!options.media)
        return error(
          res,
          503,
          "MEDIA_UNAVAILABLE",
          "Image uploads are not configured.",
        );
      try {
        const input = parse(mediaConfirmationSchema, req.body);
        await options.media.confirm(
          res.locals.user.id,
          String(req.params.itemId),
          input.publicId,
        );
        const item = await options.service.getItem(
          String(req.params.itemId),
          res.locals.user.id,
        );
        res.status(201).json({ data: item, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.put(
    "/collection/items/:itemId/media/order",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      if (!options.media)
        return error(
          res,
          503,
          "MEDIA_UNAVAILABLE",
          "Image uploads are not configured.",
        );
      try {
        const input = parse(mediaReorderSchema, req.body);
        const updated = await options.media.reorder(
          res.locals.user.id,
          String(req.params.itemId),
          input.mediaIds,
        );
        if (!updated)
          return error(res, 404, "NOT_FOUND", "Collection images not found.");
        const item = await options.service.getItem(
          String(req.params.itemId),
          res.locals.user.id,
        );
        res.json({ data: item, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.delete(
    "/collection/items/:itemId/media/:mediaId",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      if (!options.media)
        return error(
          res,
          503,
          "MEDIA_UNAVAILABLE",
          "Image uploads are not configured.",
        );
      const removed = await options.media.remove(
        res.locals.user.id,
        String(req.params.itemId),
        String(req.params.mediaId),
      );
      if (!removed)
        return error(res, 404, "NOT_FOUND", "Collection image not found.");
      res.status(204).end();
    },
  );
  return router;
}
function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CatalogError(
      "VALIDATION_ERROR",
      422,
      result.error.issues[0]?.message ?? "Invalid request.",
    );
  return result.data;
}
function handle(value: unknown, response: Response) {
  if (value instanceof CatalogError)
    return error(response, value.status, value.code, value.message);
  throw value;
}
function error(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({
    error: { code, message, requestId: String(response.req.id ?? "") },
  });
}
