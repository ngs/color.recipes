import { describe, it, expect } from "vitest";
import { json, base64url, toBase64, safeReturnTo } from "./util.ts";

describe("util", () => {
  it("json() sets status + content-type", async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("base64url is url-safe and unpadded", () => {
    const out = base64url(new Uint8Array([251, 255, 191]));
    expect(out).not.toMatch(/[+/=]/);
  });

  it("toBase64 round-trips through atob", () => {
    expect(atob(toBase64("héllo"))).toBe(
      String.fromCharCode(...new TextEncoder().encode("héllo")),
    );
  });

  it("safeReturnTo only allows same-origin paths", () => {
    expect(safeReturnTo("/x?y=1")).toBe("/x?y=1");
    expect(safeReturnTo("//evil.com")).toBe("/");
    expect(safeReturnTo("https://evil.com")).toBe("/");
    expect(safeReturnTo(null)).toBe("/");
  });
});
