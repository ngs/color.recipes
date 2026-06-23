// The gallery stage: scheme layers that wipe in on a timer (paused while a
// pointer/focus is on an overlay), a caption with the name + tag chips +
// controls, a counter, and the values overlay. Remounted (via key) whenever the
// tag filter changes.
import type { JSX } from "preact";
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
import { RollingText } from "./RollingText.tsx";
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
// by the parent once this one is opaque, yielding a crossfade. `instant` skips
// the wipe (used right after a swipe, which already revealed the new palette).
function Layer({ scheme, instant }: { scheme: IndexedScheme; instant?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (instant || prefersReducedMotion) {
      el.classList.add("is-visible");
      return;
    }
    // Force a reflow to commit the opacity:0 start state, then flip to visible so
    // the 0 -> 1 transition reliably runs. (A requestAnimationFrame here was
    // flaky for setInterval-driven auto-rotation — the class landed before paint,
    // so the fade was skipped.)
    void el.offsetWidth;
    el.classList.add("is-visible");
  }, []);
  return (
    <div class={instant ? "layer is-instant" : "layer"} ref={ref}>
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
  const [layers, setLayers] = useState<{ key: number; scheme: IndexedScheme; instant?: boolean }[]>(
    () => [{ key: 0, scheme: order[0] }],
  );
  // Live `order` for the touch handlers (attached once, so they read a ref).
  const orderRef = useRef(order);
  orderRef.current = order;
  // Swipe-to-navigate: the two layers shown mid-drag, or null when not dragging.
  // base is fully visible; top wipes over it via the --t custom property.
  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ base: IndexedScheme; top: IndexedScheme; initialT: number } | null>(
    null,
  );
  // Pause auto-rotation while the user is interacting — hovering OR keyboard
  // focus inside the stage. Tracked separately (not one `paused` flag) so that
  // focus leaving the stage actually resumes; otherwise focusing a caption
  // control once would pause rotation forever.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  // Pointer type of the last press inside an overlay, so a touch press doesn't
  // arm the focus pause on hover-capable hybrids.
  const lastPointerType = useRef<string>("mouse");
  // Pause-on-hover/focus is a pointer affordance. On a touch-only device there's
  // no natural "unhover"/"blur" — iOS keeps a sticky hover and fires no
  // mouse-leave when you next tap a non-clickable area — so the pause would
  // stick and stall auto-rotation (and a tag chip remounts straight back into
  // the stuck state). Only arm it where a real hover exists; on touch we never
  // pause, and tapping Prev/Next still restarts the dwell.
  const canHover = window.matchMedia("(hover: hover)").matches;
  const paused = hovered || focused || drag !== null;
  // Bumped on every scheme change; used as the progress-bar key so the dwell
  // animation restarts (and as the single clock that drives auto-rotation).
  const [rotation, setRotation] = useState(0);

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
    setRotation((r) => r + 1); // restart the dwell progress
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

  // Advance to the next scheme (reshuffle when wrapping). Driven by the dwell
  // progress bar's `animationend`, so pausing the bar pauses rotation too.
  const advance = (): void => {
    const p = posRef.current + 1;
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
  };

  const go = (delta: number): void => {
    const p = (posRef.current + delta + order.length) % order.length;
    posRef.current = p;
    setUrl(order[p].slug, activeTags.peek(), true);
    show(order[p]); // also bumps `rotation`, restarting the dwell progress
  };
  const onPrev = (): void => go(-1);
  const onNext = (): void => go(1);

  const onShare = (): void => {
    const url = new URL(location.href);
    url.searchParams.set("utm_source", "share");
    void navigator.share({ title: `${current.name} — color.recipes`, url: url.toString() }).catch(() => {});
  };

  // Touch swipe to navigate (mobile). Dragging left/right peeks the next/prev
  // scheme in proportionally to the drag, driving the same scaleX wipe used for
  // auto-rotation — forwards for next, reversed (the current palette wiping back
  // off the previous) for prev. Releasing past the threshold completes it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const THRESHOLD = 0.32;
    const SETTLE_MS = 320;
    const EDGE = 30; // px from each screen edge where iOS owns the swipe gesture
    const g = {
      active: false,
      decided: false,
      dir: null as "next" | "prev" | null,
      startX: 0,
      startY: 0,
      width: 1,
      progress: 0,
      settling: false,
      timer: 0,
    };

    const finalize = (dir: "next" | "prev"): void => {
      const ord = orderRef.current;
      const len = ord.length;
      const np = dir === "next" ? (posRef.current + 1) % len : (posRef.current - 1 + len) % len;
      posRef.current = np;
      const dest = ord[np];
      applyTheme(dest);
      setTitle(dest);
      setUrl(dest.slug, activeTags.peek(), true);
      setCurrent(dest);
      setRotation((r) => r + 1); // restart the dwell progress
      layerKey.current += 1;
      // The swipe already revealed `dest`, so mount it without re-wiping.
      setLayers([{ key: layerKey.current, scheme: dest, instant: true }]);
      setDrag(null);
    };

    const onStart = (e: TouchEvent): void => {
      if (g.settling || e.touches.length !== 1 || orderRef.current.length <= 1) return;
      // Leave taps on the overlays (chips, controls, values) to those handlers.
      if ((e.target as Element | null)?.closest(".caption, .spaces, .counter")) return;
      g.active = true;
      g.decided = false;
      g.dir = null;
      g.startX = e.touches[0].clientX;
      g.startY = e.touches[0].clientY;
      g.width = el.clientWidth || 1;
      g.progress = 0;
    };

    const onMove = (e: TouchEvent): void => {
      if (!g.active) return;
      const dx = e.touches[0].clientX - g.startX;
      const dy = e.touches[0].clientY - g.startY;
      if (!g.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) >= Math.abs(dx)) {
          g.active = false; // vertical intent — let the page have it
          return;
        }
        g.decided = true;
        const ord = orderRef.current;
        const len = ord.length;
        const pos = posRef.current;
        if (dx < 0) {
          g.dir = "next";
          setDrag({ base: ord[pos], top: ord[(pos + 1) % len], initialT: 0 });
        } else {
          g.dir = "prev";
          setDrag({ base: ord[(pos - 1 + len) % len], top: ord[pos], initialT: 1 });
        }
      }
      e.preventDefault();
      g.progress = Math.min(Math.max(Math.abs(dx) / g.width, 0), 1);
      const t = g.dir === "next" ? g.progress : 1 - g.progress;
      topRef.current?.style.setProperty("--t", String(t));
    };

    const onEnd = (): void => {
      if (!g.active || !g.decided || !g.dir) {
        g.active = false;
        return;
      }
      const dir = g.dir;
      const committed = g.progress >= THRESHOLD;
      const targetT = dir === "next" ? (committed ? 1 : 0) : committed ? 0 : 1;
      const top = topRef.current;
      if (top) {
        top.classList.add("settling");
        top.style.setProperty("--t", String(targetT));
      }
      g.active = false;
      g.decided = false;
      g.dir = null;
      g.settling = true;
      g.timer = window.setTimeout(() => {
        g.settling = false;
        if (committed) finalize(dir);
        else setDrag(null);
      }, SETTLE_MS);
    };

    // iOS Safari's edge swipe-back/forward is a system gesture recognized before
    // our touchmove can preventDefault, so suppress it at touchstart for touches
    // that begin in the edge zone over non-interactive content (where the
    // gallery swipe lives — taps on edge buttons/links/inputs are left alone).
    const onEdgeGuard = (e: TouchEvent): void => {
      const x = e.touches[0]?.clientX ?? EDGE;
      if (x > EDGE && x < window.innerWidth - EDGE) return;
      if ((e.target as Element | null)?.closest("a, button, input, textarea, select, label")) return;
      e.preventDefault();
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    document.addEventListener("touchstart", onEdgeGuard, { passive: false, capture: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      document.removeEventListener("touchstart", onEdgeGuard, { capture: true });
      window.clearTimeout(g.timer);
    };
  }, []);

  const counterText =
    `${activeTags.value.length ? activeTags.value.join(" + ") + " · " : ""}` +
    `${order.length} scheme${order.length === 1 ? "" : "s"}`;

  // Show the selected (checked) tags first; stable sort keeps each group's order.
  const selected = new Set(activeTags.value);
  const sortedTags = [...current.tags].sort(
    (a, b) => Number(selected.has(b)) - Number(selected.has(a)),
  );

  // Pause auto-rotation only while pointer/focus is on an overlay (caption or
  // values) — NOT over the full-bleed palette, so an idle cursor doesn't stall
  // rotation. Resume once focus leaves the overlay entirely. Disabled entirely
  // on touch-only devices (see `canHover`).
  const pauseProps: JSX.HTMLAttributes<HTMLDivElement> = canHover
    ? {
        onPointerDownCapture: (e) => {
          lastPointerType.current = e.pointerType;
        },
        // Hover pause is mouse-only: a touch "hover" never leaves and would stick.
        onPointerEnter: (e) => {
          if (e.pointerType === "mouse") setHovered(true);
        },
        onPointerLeave: (e) => {
          if (e.pointerType === "mouse") setHovered(false);
        },
        // Focus pause is for keyboard users; skip it for touch taps, which can
        // focus a control without ever firing a matching blur on iOS.
        onFocusCapture: () => {
          if (lastPointerType.current !== "touch") setFocused(true);
        },
        onBlurCapture: (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        },
      }
    : {};

  return (
    <div class="stage" ref={stageRef}>
      {drag ? (
        <>
          <div class="layer drag-base">
            {drag.base.colors.map((hex, i) => (
              <div key={i} class="swatch" style={{ background: hex }} />
            ))}
          </div>
          <div
            class="layer drag-top"
            ref={topRef}
            style={{ "--t": String(drag.initialT) } as JSX.CSSProperties}
          >
            {drag.top.colors.map((hex, i) => (
              <div key={i} class="swatch" style={{ background: hex }} />
            ))}
          </div>
        </>
      ) : (
        layers.map((l) => <Layer key={l.key} scheme={l.scheme} instant={l.instant} />)
      )}
      <div class="caption" {...pauseProps}>
        {order.length > 1 && (
          <div class="caption-progress-track" aria-hidden="true">
            <div
              class="caption-progress"
              key={rotation}
              style={{ animationDuration: `${ROTATE_MS}ms`, animationPlayState: paused ? "paused" : "running" }}
              onAnimationEnd={advance}
            />
          </div>
        )}
        <h2>
          <RollingText text={current.name} />
        </h2>
        <div class="meta">
          {sortedTags.map((t, i) => {
            const active = selected.has(t);
            return (
              // Keyed by position (not tag) so the chip persists across schemes
              // and its label rolls from the old tag to the new one.
              <button
                key={i}
                type="button"
                class={active ? "chip chip--active" : "chip"}
                aria-pressed={active}
                // Drop focus before toggling: chips are keyed by position, so the
                // re-sort (selected-first) would otherwise leave the focus ring
                // stuck on whatever tag lands at this index.
                onClick={(e) => {
                  e.currentTarget.blur();
                  toggleTag(t);
                }}
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
                <RollingText text={t} />
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
      <ValuesOverlay scheme={current} pauseProps={pauseProps} />
    </div>
  );
}
