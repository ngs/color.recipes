import { describe, it, expect } from "vitest";
import { signedCookie, readSignedCookie, parseCookies, cookie, clearCookie, timingSafeEqual } from "./cookies.ts";

const secret = "s3cret";
const valueOf = (setCookie: string) => decodeURIComponent(setCookie.split(";")[0].split("=").slice(1).join("="));

describe("cookies", () => {
  it("signs and verifies a value round-trip", async () => {
    const raw = valueOf(await signedCookie("cr_sess", "tok-123", secret, 100));
    expect(await readSignedCookie(raw, secret)).toBe("tok-123");
  });

  it("rejects a tampered value and a wrong secret", async () => {
    const raw = valueOf(await signedCookie("cr_sess", "tok", secret, 100));
    const tampered = "evil" + raw.slice(raw.indexOf("."));
    expect(await readSignedCookie(tampered, secret)).toBeNull();
    expect(await readSignedCookie(raw, "other-secret")).toBeNull();
  });

  it("parses the Cookie header (URL-decoding values)", () => {
    const req = new Request("https://x", { headers: { Cookie: "a=1; b=hello%20world" } });
    expect(parseCookies(req)).toEqual({ a: "1", b: "hello world" });
  });

  it("serializes Secure/HttpOnly cookies and a clearing cookie", () => {
    expect(cookie("n", "v", { maxAge: 60 })).toContain("HttpOnly");
    expect(cookie("n", "v")).toContain("Secure");
    expect(clearCookie("n")).toContain("Max-Age=0");
  });

  it("timingSafeEqual compares without early length leaks", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "ab")).toBe(false);
  });
});
