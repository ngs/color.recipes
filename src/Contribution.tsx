// Zero-match contribution flow (SPEC §1, §7): copy the AI prompt -> paste the
// returned JSON -> normalize + preview -> GitHub login -> fork + PR via the
// Worker. The app fills version/source/createdAt; the AI returns only
// name/tags/colors.
import { Fragment } from "preact";
import type { ComponentChildren } from "preact";
import { useState, useEffect, useMemo, useRef, useCallback } from "preact/hooks";
import { validateAiInput, validateScheme, validateRepoName, slugify, type Scheme } from "./validate.ts";
import { FORMATTERS, readableText } from "./color.ts";
import { activeTags, navMode, setUrl } from "./state.ts";
import { Icon, ICONS } from "./icons.tsx";

const DEFAULT_COUNT = 5;
const DEFAULT_FORK = "color.recipes"; // upstream repo name; the default fork name

// Frozen template (SPEC §7). {{tags}} / {{count}} / {{slots}} are filled at runtime.
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
  if (!text.startsWith("{")) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  return JSON.parse(text);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Normalize pasted text into a complete, validated scheme. */
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

// ---------- fork API ----------
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

// GitHub-style fork-destination picker: choose owner + name with live
// availability/reuse status. Calls onChoose with the target, or onCancel.
function ForkPicker({
  login,
  owners,
  onChoose,
  onCancel,
}: {
  login: string;
  owners: ForkOwner[];
  onChoose: (target: { owner: string; name: string }) => void;
  onCancel: () => void;
}) {
  const [owner, setOwner] = useState(owners[0]?.login ?? login);
  const [name, setName] = useState(DEFAULT_FORK);
  const [status, setStatus] = useState("");
  const [okLabel, setOkLabel] = useState("Create fork & open PR");
  const [okDisabled, setOkDisabled] = useState(true);
  const seqRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  const recheck = useCallback(async (ownerVal: string, nameVal: string): Promise<void> => {
    const mine = ++seqRef.current;
    const local = validateRepoName(nameVal);
    if (!local.ok) {
      setStatus(local.errors.join("; "));
      setOkDisabled(true);
      return;
    }
    setStatus("Checking availability…");
    setOkDisabled(true);
    const r = await checkForkTarget(ownerVal, local.value);
    if (mine !== seqRef.current) return; // superseded by a newer check
    const target = `${ownerVal}/${local.value}`;
    if (!r.valid) {
      setStatus((r.errors ?? ["invalid name"]).join("; "));
      setOkDisabled(true);
    } else if (r.available) {
      setStatus(`Will create ${target}`);
      setOkLabel("Create fork & open PR");
      setOkDisabled(false);
    } else if (r.isOurFork || r.isUpstream) {
      setStatus(`Will reuse ${target}`);
      setOkLabel("Open PR");
      setOkDisabled(false);
    } else {
      setStatus(`${target} already exists — choose another name or owner`);
      setOkDisabled(true);
    }
  }, []);

  // Initial check, and an immediate re-check whenever the owner changes.
  useEffect(() => {
    void recheck(owner, name);
  }, [owner]);

  return (
    <div class="fork-prompt">
      <label>Fork destination — choose an account or organization</label>
      <div class="fork-row">
        <select class="fork-owner" value={owner} onChange={(e) => setOwner((e.target as HTMLSelectElement).value)}>
          {owners.map((o) => {
            const suffix =
              o.login === login ? " (you)" : o.canCreate === false ? " (insufficient permission)" : "";
            return (
              <option key={o.login} value={o.login} disabled={o.canCreate === false}>
                {o.login}
                {suffix}
              </option>
            );
          })}
        </select>
        <span class="fork-slash">/</span>
        <input
          type="text"
          class="fork-input"
          value={name}
          onInput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            setName(v);
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = window.setTimeout(() => void recheck(owner, v), 250);
          }}
        />
      </div>
      <div class="row">
        <button
          class="btn btn-primary"
          disabled={okDisabled}
          onClick={() => {
            const local = validateRepoName(name);
            if (local.ok) onChoose({ owner, name: local.value });
          }}
        >
          {okLabel}
        </button>
        <button class="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div class="fork-status">{status}</div>
    </div>
  );
}

export function Contribution({ tags }: { tags: string[] }) {
  // Zero-match flow owns the URL while shown (no scheme on screen).
  useEffect(() => {
    setUrl("", activeTags.peek(), navMode.value === "push");
    navMode.value = "replace";
  }, []);

  const prompt = useMemo(() => buildPrompt(tags), [tags.join(",")]);
  const [copied, setCopied] = useState(false);
  const [paste, setPaste] = useState("");
  const [current, setCurrent] = useState<Scheme | undefined>(undefined);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; node: ComponentChildren } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [opened, setOpened] = useState(false);
  const [fork, setFork] = useState<{ login: string; owners: ForkOwner[] } | null>(null);

  const renderPreview = (text: string): void => {
    const result = normalize(text);
    if (result.errors) {
      setCurrent(undefined);
      setNotice({ kind: "error", node: result.errors.map((e, i) => <div key={i}>• {e}</div>) });
      return;
    }
    const s = result.scheme;
    setCurrent(s);
    setNotice({
      kind: "ok",
      node: (
        <Fragment>
          <strong>{s.name}</strong> — {s.tags.join(", ")}
          <br />
          <small>schemes/{slugify(s.name)}.json</small>
          <br />
          {s.colors.map((hex, i) => (
            <Fragment key={i}>
              {FORMATTERS.hex(hex)} · {FORMATTERS.oklch(hex)}
              <br />
            </Fragment>
          ))}
        </Fragment>
      ),
    });
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard?.writeText(prompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const beginSubmit = async (): Promise<void> => {
    if (!current) return;
    setSubmitting(true);
    try {
      const me = await fetch("/api/auth/me");
      if (me.status === 401) {
        const ret = encodeURIComponent(location.pathname + location.hash);
        location.href = `/api/auth/login?return_to=${ret}`;
        return;
      }
      const { login, owners } = await fetchOwners();
      setFork({ login, owners });
    } catch (e) {
      setNotice({ kind: "error", node: `Submit failed: ${(e as Error).message}` });
      setSubmitting(false);
    }
  };

  const finishSubmit = async (target: { owner: string; name: string }): Promise<void> => {
    setFork(null);
    if (!current) {
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheme: current, forkOwner: target.owner, forkName: target.name }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error || `Submit failed (${res.status})`);
      setNotice({
        kind: "ok",
        node: (
          <Fragment>
            Pull request opened:{" "}
            <a href={data.url} target="_blank" rel="noopener">
              {data.url}
            </a>
          </Fragment>
        ),
      });
      setOpened(true);
    } catch (e) {
      setNotice({ kind: "error", node: `Submit failed: ${(e as Error).message}` });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div class="panel">
      <h1>No matching scheme yet</h1>
      <p>
        {tags.length
          ? `Nothing matches ${tags.map((t) => `“${t}”`).join(" + ")}. Generate one with your own AI and contribute it as a PR.`
          : "Search by tag above, or contribute a new scheme below."}
      </p>

      <div class="block">
        <label>1. Copy this prompt and run it in your own AI (e.g. Claude)</label>
        <pre class="prompt-box">{prompt}</pre>
        <div class="row">
          <button class="btn btn-primary" onClick={copy}>
            {copied ? (
              <Fragment>
                Copied <Icon def={ICONS.check} />
              </Fragment>
            ) : (
              "Copy prompt"
            )}
          </button>
        </div>
      </div>

      <div class="block">
        <label>2. Paste the JSON it returns, then preview</label>
        <textarea
          placeholder={'{"name":"…","tags":["…"],"colors":["#……","#……"]}'}
          value={paste}
          onInput={(e) => {
            const v = (e.target as HTMLTextAreaElement).value;
            setPaste(v);
            if (current || v.trim()) renderPreview(v);
          }}
        />
        <div class="row">
          <button class="btn" onClick={() => renderPreview(paste)}>
            Preview
          </button>
          <button class="btn btn-primary" disabled={!current || submitting || opened} onClick={beginSubmit}>
            {opened ? (
              <Fragment>
                Opened <Icon def={ICONS.check} />
              </Fragment>
            ) : submitting ? (
              "Submitting…"
            ) : (
              "Log in & open PR"
            )}
          </button>
        </div>
        {current && (
          <div class="preview-swatches">
            {current.colors.map((hex, i) => (
              <div key={i} title={hex} style={`background:${hex};color:${readableText(hex)}`} />
            ))}
          </div>
        )}
        {notice && <div class={`notice ${notice.kind}`}>{notice.node}</div>}
        {fork && (
          <ForkPicker
            login={fork.login}
            owners={fork.owners}
            onChoose={(t) => void finishSubmit(t)}
            onCancel={() => {
              setFork(null);
              setSubmitting(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
