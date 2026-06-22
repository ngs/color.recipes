// The bottom-right values overlay: a borderless dropdown picks one color space,
// and the table shows that space's value for each color (click a value to copy).
import { selectedSpace } from "./state.ts";
import { FORMATTERS, type ColorSpace } from "./color.ts";
import type { IndexedScheme } from "./types.ts";
import { Icon, ICONS } from "./icons.tsx";

const SPACES: ColorSpace[] = ["hex", "rgb", "hsl", "oklch", "cmyk"];
const SPACE_LABELS: Record<ColorSpace, string> = {
  hex: "HEX",
  rgb: "RGB",
  hsl: "HSL",
  oklch: "OKLCH",
  cmyk: "CMYK",
};

export function ValuesOverlay({ scheme }: { scheme: IndexedScheme }) {
  const space = selectedSpace.value;
  return (
    <div class="spaces">
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
          {scheme.colors.map((hex) => {
            const text = FORMATTERS[space](hex);
            return (
              <tr key={hex}>
                <td class="dot">
                  <span class="sw" style={{ background: hex }} />
                </td>
                <td title="Click to copy" onClick={() => navigator.clipboard?.writeText(text)}>
                  {text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
