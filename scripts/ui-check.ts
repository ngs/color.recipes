// Headless UI check (no Chrome MCP needed). Run after `npm run build` — the
// `test:ui` script chains them. Serves dist/client statically, drives a headless
// browser, and asserts the search/suggestion/chip behaviour.
//
// Uses the system Google Chrome via Playwright's `channel: "chrome"` so no large
// browser download is required. If Chrome is missing, install Playwright's bundled
// Chromium with: npx playwright install chromium

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(root, "dist", "client");
const PORT = 4185;
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    if (p === "/") p = "/index.html";
    let file = join(DIR, normalize(p));
    try {
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    } catch {
      file = join(DIR, "index.html"); // SPA fallback
    }
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
const base = `http://localhost:${PORT}`;

async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    /* fall through to bundled Chromium */
  }
  try {
    return await chromium.launch({ headless: true });
  } catch {
    console.error(
      "Could not launch a browser. Install Chromium for Playwright:\n  npx playwright install chromium",
    );
    server.close();
    process.exit(2);
  }
}

interface Result {
  name: string;
  ok: boolean;
  detail: string;
}
const results: Result[] = [];
const check = (name: string, ok: unknown, detail = ""): void => {
  results.push({ name, ok: !!ok, detail });
};
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#search-input");
  await page.waitForFunction(
    () => !!document.querySelector(".stage") || !!document.querySelector(".panel"),
  );
  const input = page.locator("#search-input");

  // 1. initial state
  check("no chips initially", (await page.locator(".token").count()) === 0);
  check("suggest hidden initially", (await page.locator("#suggest.hidden").count()) === 1);

  // focus shows the combinable set (even with an empty query); blur hides it
  await input.focus();
  await pause(50);
  check("focus shows suggestions", (await page.locator("#suggest:not(.hidden)").count()) === 1);
  const emptyCount = await page.locator("#suggest .sg").count();
  check("focus lists combinable tags", emptyCount >= 1, `count=${emptyCount}`);
  const scrollable = await page.locator("#suggest").evaluate((el) => el.scrollWidth > el.clientWidth);
  check("suggestion row scrolls horizontally when long", scrollable, `scrollable=${scrollable}`);
  await input.blur();
  await pause(180);
  check("blur hides suggestions", (await page.locator("#suggest.hidden").count()) === 1);

  // theme adopts the displayed scheme (--accent set inline on <html>)
  const accentVar = await page.evaluate(() =>
    document.documentElement.style.getPropertyValue("--accent").trim(),
  );
  check("UI theme adopts a scheme color", /^#[0-9a-f]{6}$/i.test(accentVar), `--accent=${accentVar}`);

  // 2. a common letter still yields suggestions, all on one row
  await input.fill("a");
  await pause(60);
  check("'a' shows suggestions", (await page.locator("#suggest:not(.hidden)").count()) === 1);
  const aCount = await page.locator("#suggest .sg").count();
  check("'a' has >=1 suggestion", aCount >= 1, `count=${aCount}`);
  const tops = await page
    .locator("#suggest .sg")
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  check("'a' suggestions on a single row", new Set(tops).size <= 1, `tops=${JSON.stringify(tops)}`);

  // 3. ordering by count: 'y' -> city first
  await input.fill("y");
  await pause(60);
  const firstY = (await page.locator("#suggest .sg").first().textContent())?.trim();
  check("'y' first suggestion is city", !!firstY && firstY.startsWith("city"), `got=${firstY}`);

  // 4. clicking a suggestion adds a chip and clears the field
  await input.fill("win");
  await pause(60);
  await page.locator("#suggest .sg", { hasText: "winter" }).first().click();
  await pause(60);
  check("clicking suggestion adds chip", (await page.locator(".token", { hasText: "winter" }).count()) === 1);
  check("input cleared after pick", (await input.inputValue()) === "");
  // still focused after pick -> suggestions stay open, now showing what narrows winter
  check("suggest stays open after pick", (await page.locator("#suggest:not(.hidden)").count()) === 1);
  check("post-pick suggestions co-occur with winter", (await page.locator("#suggest .sg", { hasText: "snow" }).count()) >= 1);

  // 5. X removes the chip
  await page.locator(".token", { hasText: "winter" }).locator("button").click();
  await pause(60);
  check("X removes chip", (await page.locator(".token", { hasText: "winter" }).count()) === 0);

  // 6. typing an unknown tag + Enter -> chip added, "No matching" flow
  await input.fill("zzz");
  await input.press("Enter");
  await pause(100);
  check("Enter adds the typed chip", (await page.locator(".token", { hasText: "zzz" }).count()) === 1);
  check(
    "unknown tag chip is visually distinguished",
    (await page.locator(".token.token--unknown", { hasText: "zzz" }).count()) === 1,
  );
  check(
    "Enter on unknown tag shows the No-matching panel",
    (await page.locator("#app .panel").filter({ hasText: "No matching" }).count()) === 1,
  );
  check(
    "zero-match URL is /?t=<tags>",
    (await page.evaluate(() => location.pathname + location.search)) === "/?t=zzz",
  );

  // 7. a known tag via Enter -> gallery
  await page.locator(".token", { hasText: "zzz" }).locator("button").click();
  await pause(40);
  await input.fill("winter");
  await input.press("Enter");
  await pause(140);
  check("Enter on a known tag shows the gallery", (await page.locator("#app .stage").count()) === 1);
  check("known-tag chip present", (await page.locator(".token", { hasText: "winter" }).count()) === 1);
  check(
    "known-tag chip uses the normal (not unknown) style",
    (await page.locator(".token--unknown", { hasText: "winter" }).count()) === 0,
  );
  const url7 = await page.evaluate(() => location.pathname + location.search);
  check("URL reflects scheme slug + tag filter", /^\/[\w.-]+\?t=winter$/.test(url7), `url=${url7}`);

  // 8. export menu + downloads (gallery is on screen from step 7)
  await page.locator("#app .dl > .btn").click();
  await pause(40);
  const formatCount = await page.locator(".dl-menu li").count();
  check("download menu lists multiple formats", formatCount >= 8, `formats=${formatCount}`);

  const [cssDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(".dl-menu li", { hasText: /^CSS variables$/ }).click(),
  ]);
  check("CSS export downloads a .css file", cssDownload.suggestedFilename().endsWith(".css"), cssDownload.suggestedFilename());

  await page.locator("#app .dl > .btn").click();
  await pause(40);
  const [xcDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator(".dl-menu li", { hasText: "Xcode" }).click(),
  ]);
  check("Xcode export downloads a .zip", xcDownload.suggestedFilename().endsWith(".zip"), xcDownload.suggestedFilename());
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
