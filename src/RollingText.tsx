// Renders text that "rolls" (charcode interpolation) whenever the `text` prop
// changes. The element's textContent is driven imperatively by rollText; the
// first value is set without animation. White-space is preserved so padded
// spaces don't collapse mid-roll.
import { useRef, useLayoutEffect } from "preact/hooks";
import { rollText, EASINGS, type Easing } from "./textRoll.ts";

export function RollingText({
  text,
  duration = 1200,
  easing = EASINGS.easeInOutSine,
}: {
  text: string;
  duration?: number;
  easing?: Easing;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<string | null>(null);
  const cancel = useRef<() => void>(() => {});
  // Read the latest animation options at roll time without re-running (and thus
  // cancelling) on every render when an inline `easing`/`duration` is passed.
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const easingRef = useRef(easing);
  easingRef.current = easing;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prev.current === null) {
      el.textContent = text; // first paint: no roll
      prev.current = text;
      return;
    }
    if (prev.current === text) return;
    cancel.current();
    cancel.current = rollText(el, prev.current, text, {
      duration: durationRef.current,
      easing: easingRef.current,
    });
    prev.current = text;
    return () => cancel.current();
  }, [text]);

  return <span ref={ref} style="white-space:pre" />;
}
