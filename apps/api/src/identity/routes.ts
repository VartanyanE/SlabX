import {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import type { ZodType } from "zod";
import cookieParser from "cookie-parser";
import {
  addressInputSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  profileUpdateSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  tokenRequestSchema,
} from "@slabx/contracts";
import { GoogleOidc } from "./google.js";
import { IdentityError, IdentityService } from "./service.js";

const SESSION_COOKIE = "slabx_session";
const CSRF_COOKIE = "slabx_csrf";
const GOOGLE_FLOW_COOKIE = "slabx_google_flow";

export function createIdentityRouter(options: {
  service: IdentityService;
  google: GoogleOidc;
  secureCookies: boolean;
  webOrigin: string;
}): Router {
  const router = Router();
  router.use(cookieParser());
  const authLimit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const requireAuth: RequestHandler = async (request, response, next) => {
    const session = await options.service.authenticate(
      request.cookies[SESSION_COOKIE],
    );
    if (!session)
      return sendError(
        response,
        401,
        "AUTHENTICATION_REQUIRED",
        "Please sign in.",
      );
    response.locals.session = session;
    response.locals.user = session.user;
    next();
  };
  const requireCsrf: RequestHandler = (request, response, next) => {
    const header = request.get("x-csrf-token");
    if (
      !options.service.validateCsrf(
        header,
        response.locals.session.csrfTokenHash,
      )
    )
      return sendError(
        response,
        403,
        "CSRF_INVALID",
        "Refresh the page and try again.",
      );
    next();
  };

  router.post("/auth/register", authLimit, async (req, res) => {
    try {
      const result = await options.service.register(
        parse(registerRequestSchema, req.body),
      );
      res.status(201).json({
        data: { ...result, verificationRequired: true },
        meta: { requestId: req.id },
      });
    } catch (e) {
      handle(e, res);
    }
  });
  router.post("/auth/email/verify", authLimit, async (req, res) => {
    try {
      await options.service.verifyEmail(
        parse(tokenRequestSchema, req.body).token,
      );
      res.status(204).end();
    } catch (e) {
      handle(e, res);
    }
  });
  router.post("/auth/login", authLimit, async (req, res) => {
    try {
      const result = await options.service.login(
        parse(loginRequestSchema, req.body),
        requestContext(req),
      );
      setSessionCookies(res, result, options.secureCookies);
      const user = await options.service.getUser(result.userId);
      res.json({
        data: { user, csrfToken: result.csrfToken },
        meta: { requestId: req.id },
      });
    } catch (e) {
      handle(e, res);
    }
  });
  router.post("/auth/logout", requireAuth, requireCsrf, async (req, res) => {
    await options.service.logout(req.cookies[SESSION_COOKIE]);
    clearSessionCookies(res, options.secureCookies);
    res.status(204).end();
  });
  router.post(
    "/auth/logout-all",
    requireAuth,
    requireCsrf,
    async (_req, res) => {
      await options.service.logoutAll(res.locals.user.id);
      clearSessionCookies(res, options.secureCookies);
      res.status(204).end();
    },
  );
  router.post("/auth/password/forgot", authLimit, async (req, res) => {
    await options.service.forgotPassword(
      parse(forgotPasswordRequestSchema, req.body).email,
    );
    res
      .status(202)
      .json({ data: { accepted: true }, meta: { requestId: req.id } });
  });
  router.post("/auth/password/reset", authLimit, async (req, res) => {
    try {
      const body = parse(resetPasswordRequestSchema, req.body);
      await options.service.resetPassword(body.token, body.password);
      clearSessionCookies(res, options.secureCookies);
      res.status(204).end();
    } catch (e) {
      handle(e, res);
    }
  });

  router.get("/auth/google/start", authLimit, async (req, res) => {
    try {
      const flow = await options.google.start(
        typeof req.query.returnTo === "string" ? req.query.returnTo : undefined,
      );
      res.cookie(
        GOOGLE_FLOW_COOKIE,
        flow.flowCookie,
        cookieOptions(options.secureCookies, 10 * 60_000),
      );
      res.redirect(flow.url);
    } catch {
      sendError(
        res,
        503,
        "GOOGLE_LOGIN_UNAVAILABLE",
        "Google login is not configured.",
      );
    }
  });
  router.get("/auth/google/callback", authLimit, async (req, res) => {
    try {
      const identity = await options.google.callback(
        new URL(req.originalUrl, req.protocol + "://" + req.get("host")),
        req.cookies[GOOGLE_FLOW_COOKIE],
      );
      const result = await options.service.loginWithGoogle(
        identity,
        requestContext(req),
      );
      setSessionCookies(res, result, options.secureCookies);
      res.clearCookie(GOOGLE_FLOW_COOKIE, cookieOptions(options.secureCookies));
      res.redirect(new URL(identity.returnTo, options.webOrigin).href);
    } catch {
      res.clearCookie(GOOGLE_FLOW_COOKIE, cookieOptions(options.secureCookies));
      res.redirect(new URL("/login?error=google", options.webOrigin).href);
    }
  });

  router.get("/me", requireAuth, (_req, res) =>
    res.json({ data: res.locals.user, meta: { requestId: res.req.id } }),
  );
  router.get("/me/sessions", requireAuth, async (req, res) =>
    res.json({
      data: await options.service.listSessions(
        res.locals.user.id,
        req.cookies[SESSION_COOKIE],
      ),
      meta: { requestId: req.id },
    }),
  );
  router.patch("/me/profile", requireAuth, requireCsrf, async (req, res) => {
    try {
      const user = await options.service.updateProfile(
        res.locals.user.id,
        parse(profileUpdateSchema, req.body),
      );
      res.json({ data: user, meta: { requestId: req.id } });
    } catch (e) {
      handle(e, res);
    }
  });
  router.get("/me/addresses", requireAuth, async (req, res) =>
    res.json({
      data: await options.service.listAddresses(res.locals.user.id),
      meta: { requestId: req.id },
    }),
  );
  router.post("/me/addresses", requireAuth, requireCsrf, async (req, res) => {
    try {
      const address = await options.service.createAddress(
        res.locals.user.id,
        parse(addressInputSchema, req.body),
      );
      res.status(201).json({ data: address, meta: { requestId: req.id } });
    } catch (e) {
      handle(e, res);
    }
  });
  router.patch(
    "/me/addresses/:addressId",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      try {
        const address = await options.service.updateAddress(
          res.locals.user.id,
          String(req.params.addressId),
          parse(addressInputSchema, req.body),
        );
        if (!address)
          return sendError(res, 404, "NOT_FOUND", "Address not found.");
        res.json({ data: address, meta: { requestId: req.id } });
      } catch (e) {
        handle(e, res);
      }
    },
  );
  router.delete(
    "/me/addresses/:addressId",
    requireAuth,
    requireCsrf,
    async (req, res) => {
      const deleted = await options.service.deleteAddress(
        res.locals.user.id,
        String(req.params.addressId),
      );
      if (!deleted)
        return sendError(res, 404, "NOT_FOUND", "Address not found.");
      res.status(204).end();
    },
  );
  return router;
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new IdentityError(
      "VALIDATION_ERROR",
      422,
      result.error.issues[0]?.message ?? "Invalid request.",
    );
  return result.data;
}
function handle(error: unknown, response: Response) {
  if (error instanceof IdentityError)
    return sendError(response, error.status, error.code, error.message);
  throw error;
}
function sendError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  return response.status(status).json({
    error: { code, message, requestId: String(response.req.id ?? "") },
  });
}
function requestContext(request: Request) {
  const userAgent = request.get("user-agent");
  return {
    ...(request.ip ? { ip: request.ip } : {}),
    ...(userAgent ? { userAgent } : {}),
  };
}
function cookieOptions(secure: boolean, maxAge?: number) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    ...(maxAge ? { maxAge } : {}),
  };
}
function setSessionCookies(
  response: Response,
  result: { sessionToken: string; csrfToken: string },
  secure: boolean,
) {
  response.cookie(
    SESSION_COOKIE,
    result.sessionToken,
    cookieOptions(secure, 30 * 24 * 60 * 60_000),
  );
  response.cookie(CSRF_COOKIE, result.csrfToken, {
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60_000,
  });
}
function clearSessionCookies(response: Response, secure: boolean) {
  response.clearCookie(SESSION_COOKIE, cookieOptions(secure));
  response.clearCookie(CSRF_COOKIE, { secure, sameSite: "lax", path: "/" });
}
