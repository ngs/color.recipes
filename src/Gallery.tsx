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
import { Download } from "./Download.tsx";
import { ValuesOverlay } from "./ValuesOverlay.tsx";
import { Icon, ICONS } from "./icons.tsx";

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
  const [paused, setPaused] = useState(false);
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

  const onNext = (): void => {
    const p = (posRef.current + 1) % order.length;
    posRef.current = p;
    setUrl(order[p].slug, activeTags.peek(), true);
    show(order[p]);
    setTick((t) => t + 1); // Next resets the dwell timer
  };

  const counterText =
    `${activeTags.value.length ? activeTags.value.join(" + ") + " · " : ""}` +
    `${order.length} scheme${order.length === 1 ? "" : "s"}`;

  return (
    <div
      class="stage"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
    >
      {layers.map((l) => (
        <Layer key={l.key} scheme={l.scheme} />
      ))}
      <div class="caption">
        <h2>{current.name}</h2>
        <div class="meta">
          {current.tags.map((t) => (
            <button key={t} type="button" class="chip" onClick={() => toggleTag(t)}>
              {t}
            </button>
          ))}
        </div>
        <div class="controls">
          <button type="button" class="btn btn-icon" onClick={onNext}>
            Next
            <Icon def={ICONS.arrowRight} />
          </button>
          <Download scheme={current} />
        </div>
      </div>
      <div class="counter">{counterText}</div>
      <ValuesOverlay scheme={current} />
    </div>
  );
}
