// Export dropdown: downloads the displayed scheme in any supported format
// (export.ts). The menu closes on the next outside click.
import { useState, useEffect } from "preact/hooks";
import { FORMATS, triggerDownload } from "./export.ts";
import type { IndexedScheme } from "./types.ts";
import { Icon, ICONS } from "./icons.tsx";

export function Download({ scheme }: { scheme: IndexedScheme }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (): void => setOpen(false);
    // Defer so the click that opened the menu doesn't immediately close it.
    const id = window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("click", close);
    };
  }, [open]);

  return (
    <div class="dl">
      <button
        type="button"
        class="btn btn-icon"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        Download
        <Icon def={ICONS.chevronDown} />
      </button>
      <ul class={open ? "dl-menu" : "dl-menu hidden"}>
        {FORMATS.map((f) => (
          <li
            key={f.id}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              const { filename, blob } = f.generate(scheme);
              triggerDownload(filename, blob);
            }}
          >
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
