// The bottom-right values overlay: a borderless dropdown picks one color space,
// and the table shows that space's value for each color (click a value to copy).
import type { JSX } from "preact";
import { selectedSpace } from "./state.ts";
import { FORMATTERS, type ColorSpace } from "./color.ts";
import type { IndexedScheme } from "./types.ts";
import { Icon, ICONS } from "./icons.tsx";
import { RollingText } from "./RollingText.tsx";

const SPACES: ColorSpace[] = ["hex", "rgb", "hsl", "oklch", "cmyk"];
const SPACE_LABELS: Record<ColorSpace, string> = {
  hex: "HEX",
  rgb: "RGB",
  hsl: "HSL",
  oklch: "OKLCH",
  cmyk: "CMYK",
};

// Click-to-copy is only offered where the Clipboard API exists (HTTPS / secure
// context). Elsewhere the value is shown as plain, non-interactive text.
const canCopy = typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function";

export function ValuesOverlay({
  scheme,
  pauseProps,
}: {
  scheme: IndexedScheme;
  pauseProps?: JSX.HTMLAttributes<HTMLDivElement>;
}) {
  const space = selectedSpace.value;
  return (
    <div class="spaces" {...pauseProps}>
      <div class="spaces-head">
        <div class="select-wrap">
          <select
            class="spaces-select"
            aria-label="Color space"
            value={space}
            onChange={(e) => (selectedSpace.value = (e.target as HTMLSelectElement).value as ColorSpace)}
          >
            {SPACES.map((s) => (
              <option key={s} value={s}>
                {SPACE_LABELS[s]}
              </option>
            ))}
          </select>
          <Icon def={ICONS.chevronDown} class="select-chevron" />
        </div>
      </div>
      <table>
        <tbody>
          {scheme.colors.map((hex, i) => {
            const text = FORMATTERS[space](hex);
            const copy = () => void navigator.clipboard.writeText(text).catch(() => {});
            return (
              // Keyed by position so the row persists and its value rolls.
              <tr key={i}>
                <td class="dot">
                  <span class="sw" style={{ background: hex }} />
                </td>
                {canCopy ? (
                  <td
                    data-tooltip="Click to copy"
                    role="button"
                    tabIndex={0}
                    aria-label={`Copy ${text}`}
                    onClick={copy}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        copy();
                      }
                    }}
                  >
                    <RollingText text={text} />
                  </td>
                ) : (
                  <td>
                    <RollingText text={text} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
