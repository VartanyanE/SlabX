import { afterEach, describe, expect, it, vi } from "vitest";
import { ResendEmailDelivery } from "./email.js";

afterEach(() => vi.unstubAllGlobals());

describe("ResendEmailDelivery", () => {
  it("sends a verification link through the provider API", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = new ResendEmailDelivery({
      apiKey: "re_test",
      from: "SlabX <no-reply@accounts.slabxmarket.com>",
      webOrigin: "https://slabxmarket.com",
    });

    await delivery.sendVerification("collector@example.com", "secret-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, string>;
    expect(body.to).toBe("collector@example.com");
    expect(body.text).toContain(
      "https://slabxmarket.com/verify-email?token=secret-token",
    );
  });

  it("fails closed when the provider rejects delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    const delivery = new ResendEmailDelivery({
      apiKey: "invalid",
      from: "SlabX <no-reply@accounts.slabxmarket.com>",
      webOrigin: "https://slabxmarket.com",
    });
    await expect(
      delivery.sendPasswordReset("collector@example.com", "token"),
    ).rejects.toThrow("Email provider rejected delivery (403)");
  });
});
