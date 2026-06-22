// Zero-match contribution flow (SPEC §1, §7): generate/copy the AI prompt -> paste
// the returned JSON -> normalize + preview -> GitHub login -> fork + PR via the Worker.

import { validateAiInput, validateScheme, validateRepoName, slugify, type Scheme } from "./validate.ts";
import { FORMATTERS, readableText } from "./color.ts";
import { ICONS, iconNode } from "./icons.ts";

const DEFAULT_COUNT = 5;

// Frozen template (SPEC §7). {{tags}} / {{count}} are filled at runtime.
const PROMPT_TEMPLATE = `You are a color palette curator. Create ONE color scheme that fits these tags.

Tags: {{tags}}

Requirements:
- {{count}} harmonious colors forming a usable palette: include at least one light
  and one dark color (so it works for background/foreground), plus 1-2 accents.
- Keep the colors perceptually balanced: vary lightness deliberately, avoid muddy
  or clashing combinations.
- Each color as #RRGGBB hex.
- "name": a short, evocative English name for the palette.
- "tags": lowercase English tags (include the given tags, add 2-5 more for
  mood / hue / use-case), 5-8 total.
- Output ONLY the JSON below. No prose, no markdown code fences, no comments.

{"name":"...","tags":["..."],"colors":[{{slots}}]}`;

function buildPrompt(tags: string[], count = DEFAULT_COUNT): string {
  const slots = Array.from({ length: count }, () => '"#......"').join(",");
  return PROMPT_TEMPLATE.replace("{{tags}}", tags.join(", ") || "(none)")
    .replace("{{count}}", String(count))
    .replace("{{slots}}", slots);
}

/** Strip markdown code fences and surrounding prose, then JSON.parse (SPEC §7). */
function parsePasted(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} block if the model added stray prose.
  if (!text.startsWith("{")) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  return JSON.parse(text);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalize pasted text into a complete, validated scheme (the app fills the metadata). */
function normalize(raw: string): { scheme: Scheme; errors?: undefined } | { scheme?: undefined; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = parsePasted(raw);
  } catch (e) {
    return { errors: [`Could not parse JSON: ${(e as Error).message}`] };
  }
  const input = validateAiInput(parsed);
  if (!input.ok) return { errors: input.errors };

  const scheme: Scheme = {
    version: 1,
    name: input.value.name,
    tags: input.value.tags,
    colors: input.value.colors,
    source: "ai",
    createdAt: today(),
  };
  const full = validateScheme(scheme);
  if (!full.ok) return { errors: full.errors };
  return { scheme: full.value };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function mountContribution(app: HTMLElement, tags: string[]): void {
  const panel = el("div", { className: "panel" });

  panel.append(
    el("h1", {}, "No matching scheme yet"),
    el(
      "p",
      {},
      tags.length
        ? `Nothing matches ${tags.map((t) => `“${t}”`).join(" + ")}. Generate one with your own AI and contribute it as a PR.`
        : "Search by tag above, or contribute a new scheme below.",
    ),
  );

  // --- Step 1: prompt ---
  const prompt = buildPrompt(tags);
  const promptBox = el("pre", { className: "prompt-box", textContent: prompt });
  const copyBtn = el("button", { className: "btn btn-primary", textContent: "Copy prompt" });
  copyBtn.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(prompt);
    copyBtn.replaceChildren("Copied ", iconNode(ICONS.check));
    window.setTimeout(() => (copyBtn.textContent = "Copy prompt"), 1500);
  });
  panel.append(
    el(
      "div",
      { className: "block" },
      el("label", {}, "1. Copy this prompt and run it in your own AI (e.g. Claude)"),
      promptBox,
      el("div", { className: "row" }, copyBtn),
    ),
  );

  // --- Step 2: paste + preview ---
  const textarea = el("textarea", {
    placeholder: '{"name":"…","tags":["…"],"colors":["#……","#……"]}',
  });
  const previewBtn = el("button", { className: "btn", textContent: "Preview" });
  const submitBtn = el("button", { className: "btn btn-primary", textContent: "Log in & open PR" });
  submitBtn.disabled = true;
  const swatches = el("div", { className: "preview-swatches hidden" });
  const notice = el("div", { className: "notice hidden" });

  let current: Scheme | undefined;

  const showNotice = (kind: "ok" | "error", html: string) => {
    notice.className = `notice ${kind}`;
    notice.innerHTML = html;
  };

  const renderPreview = () => {
    const result = normalize(textarea.value);
    if (result.errors) {
      current = undefined;
      submitBtn.disabled = true;
      swatches.classList.add("hidden");
      showNotice("error", result.errors.map((e) => `• ${e}`).join("<br>"));
      return;
    }
    current = result.scheme;
    submitBtn.disabled = false;
    swatches.replaceChildren(
      ...current.colors.map((hex) => {
        const sw = el("div", { title: hex });
        sw.style.cssText = `background:${hex};color:${readableText(hex)}`;
        return sw;
      }),
    );
    swatches.classList.remove("hidden");
    const spaceLines = current.colors
      .map((hex) => `${FORMATTERS.hex(hex)} · ${FORMATTERS.oklch(hex)}`)
      .join("<br>");
    showNotice(
      "ok",
      `<strong>${current.name}</strong> — ${current.tags.join(", ")}<br>` +
        `<small>schemes/${slugify(current.name)}.json</small><br>${spaceLines}`,
    );
  };

  previewBtn.addEventListener("click", renderPreview);
  textarea.addEventListener("input", () => {
    if (current || textarea.value.trim()) renderPreview();
  });

  const forkMount = el("div", { className: "fork-prompt hidden" });

  submitBtn.addEventListener("click", () => void submit(current, showNotice, submitBtn, forkMount));

  panel.append(
    el(
      "div",
      { className: "block" },
      el("label", {}, "2. Paste the JSON it returns, then preview"),
      textarea,
      el("div", { className: "row" }, previewBtn, submitBtn),
      swatches,
      notice,
      forkMount,
    ),
  );

  app.replaceChildren(panel);
}

const DEFAULT_FORK = "color.recipes"; // upstream repo name; the default fork name

interface ForkCheck {
  valid: boolean;
  exists?: boolean;
  available?: boolean;
  isOurFork?: boolean;
  isUpstream?: boolean;
  errors?: string[];
}

interface ForkOwner {
  login: string;
  type: string;
  avatarUrl: string;
  canCreate?: boolean;
}

async function fetchOwners(): Promise<{ login: string; owners: ForkOwner[] }> {
  const res = await fetch("/api/fork/owners");
  if (!res.ok) throw new Error("could not list fork owners");
  return (await res.json()) as { login: string; owners: ForkOwner[] };
}

async function checkForkTarget(owner: string, name: string): Promise<ForkCheck> {
  const res = await fetch(
    `/api/fork/check?owner=${encodeURIComponent(owner)}&name=${encodeURIComponent(name)}`,
  );
  return (await res.json().catch(() => ({ valid: false, errors: ["check failed"] }))) as ForkCheck;
}

/** GitHub-style "create a new fork" picker: choose owner (you or an org) + name,
 *  with live availability/reuse status. Resolves the chosen target, or null on cancel. */
function chooseForkTarget(
  mount: HTMLElement,
  login: string,
  owners: ForkOwner[],
): Promise<{ owner: string; name: string } | null> {
  return new Promise((resolve) => {
    mount.classList.remove("hidden");

    const select = el("select", { className: "fork-owner" });
    for (const o of owners) {
      const suffix =
        o.login === login ? " (you)" : o.canCreate === false ? " (insufficient permission)" : "";
      const option = el("option", { value: o.login, textContent: `${o.login}${suffix}` });
      if (o.canCreate === false) option.disabled = true;
      select.append(option);
    }
    const nameInput = el("input", { type: "text", className: "fork-input", value: DEFAULT_FORK });
    const status = el("div", { className: "fork-status" });
    const okBtn = el("button", { className: "btn btn-primary", textContent: "Create fork & open PR" });
    const cancelBtn = el("button", { className: "btn", textContent: "Cancel" });
    okBtn.disabled = true;

    const cleanup = () => {
      mount.replaceChildren();
      mount.classList.add("hidden");
    };

    let seq = 0;
    const recheck = async () => {
      const mine = ++seq;
      const local = validateRepoName(nameInput.value);
      if (!local.ok) {
        status.textContent = local.errors.join("; ");
        okBtn.disabled = true;
        return;
      }
      const owner = select.value;
      status.textContent = "Checking availability…";
      okBtn.disabled = true;
      const r = await checkForkTarget(owner, local.value);
      if (mine !== seq) return; // superseded by a newer check
      const target = `${owner}/${local.value}`;
      if (!r.valid) {
        status.textContent = (r.errors ?? ["invalid name"]).join("; ");
        okBtn.disabled = true;
      } else if (r.available) {
        status.textContent = `Will create ${target}`;
        okBtn.textContent = "Create fork & open PR";
        okBtn.disabled = false;
      } else if (r.isOurFork || r.isUpstream) {
        status.textContent = `Will reuse ${target}`;
        okBtn.textContent = "Open PR";
        okBtn.disabled = false;
      } else {
        status.textContent = `${target} already exists — choose another name or owner`;
        okBtn.disabled = true;
      }
    };

    let timer: number | undefined;
    const debouncedRecheck = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = window.setTimeout(() => void recheck(), 250);
    };

    select.addEventListener("change", () => void recheck());
    nameInput.addEventListener("input", debouncedRecheck);
    okBtn.addEventListener("click", () => {
      const local = validateRepoName(nameInput.value);
      if (!local.ok) return;
      cleanup();
      resolve({ owner: select.value, name: local.value });
    });
    cancelBtn.addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    mount.append(
      el("label", {}, "Fork destination — choose an account or organization"),
      el("div", { className: "fork-row" }, select, el("span", { className: "fork-slash" }, "/"), nameInput),
      el("div", { className: "row" }, okBtn, cancelBtn),
      status,
    );
    void recheck();
  });
}

async function submit(
  scheme: Scheme | undefined,
  showNotice: (kind: "ok" | "error", html: string) => void,
  submitBtn: HTMLButtonElement,
  forkMount: HTMLElement,
): Promise<void> {
  if (!scheme) return;
  submitBtn.disabled = true;

  try {
    // Ensure we are logged in (httpOnly cookie; SPEC §8). If not, send to OAuth.
    const me = await fetch("/api/auth/me");
    if (me.status === 401) {
      const ret = encodeURIComponent(location.pathname + location.hash);
      location.href = `/api/auth/login?return_to=${ret}`;
      return;
    }

    // Let the user pick the fork destination (their account or an org they can use).
    const { login, owners } = await fetchOwners();
    const target = await chooseForkTarget(forkMount, login, owners);
    if (target === null) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Log in & open PR";
      return;
    }

    submitBtn.textContent = "Submitting…";
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheme, forkOwner: target.owner, forkName: target.name }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `Submit failed (${res.status})`);
    }
    showNotice(
      "ok",
      `Pull request opened: <a href="${data.url}" target="_blank" rel="noopener">${data.url}</a>`,
    );
    submitBtn.replaceChildren("Opened ", iconNode(ICONS.check));
  } catch (e) {
    showNotice("error", `Submit failed: ${(e as Error).message}`);
    submitBtn.disabled = false;
    submitBtn.textContent = "Log in & open PR";
  }
}
