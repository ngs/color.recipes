// The gallery stage: crossfading scheme layers on a timer (paused on hover/
// focus), a caption with the name + tag chips + controls, a counter, and the
// values overlay. Remounted (via key) whenever the tag filter changes.
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "preact/hooks";
import {
  activeTags,
  navMode,
  applyTheme,
  setUrl,
  setTitle,
  shuffle,
  toggleTag,
  ROTATE_MS,
} from "./state.ts";
import type { IndexedScheme } from "./types.ts";
import { FormatMenu } from "./FormatMenu.tsx";
import { ValuesOverlay } from "./ValuesOverlay.tsx";
import { Icon, ICONS } from "./icons.tsx";
import { FORMATS, triggerDownload } from "./export.ts";

// Single-file (text) formats are the ones that can be copied as a snippet.
const COPY_FORMATS = FORMATS.filter((f) => !f.binary);
// Web Share API is progressive — only show the button where it exists.
const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function makeOrder(schemes: IndexedScheme[], startSlug: string): IndexedScheme[] {
  const order = shuffle(schemes);
  if (startSlug) {
    const i = order.findIndex((s) => s.slug === startSlug);
    if (i > 0) order.unshift(order.splice(i, 1)[0]); // start on the requested scheme
  }
  return order;
}

// One full-bleed palette layer. Fades in on mount; the previous layer is dropped
// by the parent once this one is opaque, yielding a crossfade.
function Layer({ scheme }: { scheme: IndexedScheme }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion) {
      el.classList.add("is-visible");
      return;
    }
    const id = requestAnimationFrame(() => el.classList.add("is-visible"));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div class="layer" ref={ref}>
      {scheme.colors.map((hex, i) => (
        <div key={i} class="swatch" style={{ background: hex }} />
      ))}
    </div>
  );
}

export function Gallery({ schemes, startSlug }: { schemes: IndexedScheme[]; startSlug: string }) {
  const [order, setOrder] = useState<IndexedScheme[]>(() => makeOrder(schemes, startSlug));
  const posRef = useRef(0);
  const [current, setCurrent] = useState<IndexedScheme>(order[0]);
  const layerKey = useRef(0);
  const [layers, setLayers] = useState<{ key: number; scheme: IndexedScheme }[]>(() => [
    { key: 0, scheme: order[0] },
  ]);
  // Pause auto-rotation while the user is interacting — hovering OR keyboard
  // focus inside the stage. Tracked separately (not one `paused` flag) so that
  // focus leaving the stage actually resumes; otherwise focusing a caption
  // control once would pause rotation forever.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const [tick, setTick] = useState(0); // bumped to restart the dwell timer

  // First scheme: theme + URL + title. navMode says whether this mount came from
  // a manual action (push a history entry) or load/back-forward (replace).
  useEffect(() => {
    const first = order[0];
    applyTheme(first);
    setTitle(first);
    setUrl(first.slug, activeTags.peek(), navMode.value === "push");
    navMode.value = "replace";
  }, []);

  const show = useCallback((scheme: IndexedScheme): void => {
    applyTheme(scheme);
    setTitle(scheme);
    setCurrent(scheme);
    layerKey.current += 1;
    const key = layerKey.current;
    setLayers((prev) => [prev[prev.length - 1], { key, scheme }]);
  }, []);

  // Drop the outgoing layer once the incoming one has faded in over it.
  useEffect(() => {
    if (layers.length < 2) return;
    if (prefersReducedMotion) {
      setLayers((l) => l.slice(-1));
      return;
    }
    const t = window.setTimeout(() => setLayers((l) => l.slice(-1)), 1000);
    return () => window.clearTimeout(t);
  }, [layers]);

  // Auto-rotation; reshuffle when wrapping past the end.
  useEffect(() => {
    if (paused || order.length < 2) return;
    const id = window.setInterval(() => {
      let p = posRef.current + 1;
      if (p >= order.length) {
        const reshuffled = shuffle(order);
        posRef.current = 0;
        setUrl(reshuffled[0].slug, activeTags.peek(), false);
        show(reshuffled[0]);
        setOrder(reshuffled);
        return;
      }
      posRef.current = p;
      setUrl(order[p].slug, activeTags.peek(), false);
      show(order[p]);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [order, paused, tick, show]);

  const go = (delta: number): void => {
    const p = (posRef.current + delta + order.length) % order.length;
    posRef.current = p;
    setUrl(order[p].slug, activeTags.peek(), true);
    show(order[p]);
    setTick((t) => t + 1); // manual nav resets the dwell timer
  };
  const onPrev = (): void => go(-1);
  const onNext = (): void => go(1);

  const onShare = (): void => {
    const url = new URL(location.href);
    url.searchParams.set("utm_source", "share");
    void navigator.share({ title: `${current.name} — color.recipes`, url: url.toString() }).catch(() => {});
  };

  const counterText =
    `${activeTags.value.length ? activeTags.value.join(" + ") + " · " : ""}` +
    `${order.length} scheme${order.length === 1 ? "" : "s"}`;

  // Show the selected (checked) tags first; stable sort keeps each group's order.
  const selected = new Set(activeTags.value);
  const sortedTags = [...current.tags].sort(
    (a, b) => Number(selected.has(b)) - Number(selected.has(a)),
  );

  return (
    <div
      class="stage"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        // Resume once focus leaves the stage entirely (relatedTarget = where it
        // goes; null when focus is dropped).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      {layers.map((l) => (
        <Layer key={l.key} scheme={l.scheme} />
      ))}
      <div class="caption">
        <h2>{current.name}</h2>
        <div class="meta">
          {sortedTags.map((t) => {
            const active = selected.has(t);
            return (
              <button
                key={t}
                type="button"
                class={active ? "chip chip--active" : "chip"}
                aria-pressed={active}
                onClick={() => toggleTag(t)}
              >
                <span class="chip-add" aria-hidden="true">
                  {active && (
                    <span class="ic ic-rest">
                      <Icon def={ICONS.check} />
                    </span>
                  )}
                  <span class="ic ic-hover">
                    <Icon def={active ? ICONS.minus : ICONS.plus} />
                  </span>
                </span>
                {t}
              </button>
            );
          })}
        </div>
        <div class="controls">
          <div class="pager">
            <button
              type="button"
              class="ctl"
              aria-label="Prev"
              data-tooltip="Prev"
              disabled={order.length <= 1}
              onClick={onPrev}
            >
              <Icon def={ICONS.chevronLeft} />
            </button>
            <span class="pos">
              {order.indexOf(current) + 1} / {order.length}
            </span>
            <button
              type="button"
              class="ctl"
              aria-label="Next"
              data-tooltip="Next"
              disabled={order.length <= 1}
              onClick={onNext}
            >
              <Icon def={ICONS.chevronRight} />
            </button>
          </div>
          <FormatMenu
            icon={ICONS.download}
            title="Download"
            variant="menu--download"
            formats={FORMATS}
            onPick={(f) => {
              const { filename, blob } = f.generate(current);
              triggerDownload(filename, blob);
            }}
          />
          <FormatMenu
            icon={ICONS.clipboard}
            title="Copy to clipboard"
            variant="menu--copy"
            confirmIcon={ICONS.check}
            formats={COPY_FORMATS}
            onPick={async (f) => {
              const { blob } = f.generate(current);
              await navigator.clipboard?.writeText(await blob.text());
            }}
          />
          {canShare && (
            <button type="button" class="ctl" aria-label="Share" data-tooltip="Share" onClick={onShare}>
              <Icon def={ICONS.share} />
            </button>
          )}
        </div>
      </div>
      <div class="counter">{counterText}</div>
      <ValuesOverlay scheme={current} />
    </div>
  );
}
