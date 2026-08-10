import * as oidc from "openid-client";
import { hashToken, safeEqualHash } from "./crypto.js";

type Flow = {
  verifier: string;
  state: string;
  nonce: string;
  returnTo: string;
};

export class GoogleOidc {
  private configuration?: Promise<oidc.Configuration>;
  constructor(
    private readonly options: {
      clientId?: string;
      clientSecret?: string;
      callbackUrl: string;
      secret: string;
    },
  ) {}
  get configured(): boolean {
    return Boolean(this.options.clientId && this.options.clientSecret);
  }

  async start(
    returnTo = "/account",
  ): Promise<{ url: string; flowCookie: string }> {
    const config = await this.getConfiguration();
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.options.callbackUrl,
      scope: "openid email profile",
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      state,
      nonce,
    });
    return {
      url: url.href,
      flowCookie: this.seal({
        verifier,
        state,
        nonce,
        returnTo: safeReturnTo(returnTo),
      }),
    };
  }

  async callback(currentUrl: URL, flowCookie: string | undefined) {
    const flow = this.unseal(flowCookie);
    const tokens = await oidc.authorizationCodeGrant(
      await this.getConfiguration(),
      currentUrl,
      {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
      },
    );
    const claims = tokens.claims();
    if (!claims?.sub || typeof claims.email !== "string")
      throw new Error("Google did not return required identity claims");
    return {
      subject: claims.sub,
      email: claims.email,
      emailVerified: claims.email_verified === true,
      displayName:
        typeof claims.name === "string"
          ? claims.name
          : claims.email.split("@")[0]!,
      returnTo: flow.returnTo,
    };
  }

  private getConfiguration(): Promise<oidc.Configuration> {
    if (!this.configured) throw new Error("Google OIDC is not configured");
    this.configuration ??= oidc.discovery(
      new URL("https://accounts.google.com"),
      this.options.clientId!,
      this.options.clientSecret!,
    );
    return this.configuration;
  }
  private seal(flow: Flow): string {
    const body = Buffer.from(JSON.stringify(flow)).toString("base64url");
    return `${body}.${hashToken(body, this.options.secret)}`;
  }
  private unseal(value: string | undefined): Flow {
    if (!value) throw new Error("Missing Google login state");
    const [body, signature] = value.split(".");
    if (
      !body ||
      !signature ||
      !safeEqualHash(hashToken(body, this.options.secret), signature)
    )
      throw new Error("Invalid Google login state");
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Flow;
  }
}

function safeReturnTo(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
