// An icon-button dropdown over export formats. Used twice in the caption
// controls: "Download" (every format, triggers a download) and "Copy to
// clipboard" (text formats only, copies the snippet). The menu closes on the
// next outside click; pass `confirmIcon` to briefly swap the button icon after a
// pick (used for the copy confirmation).
import { useState, useEffect } from "preact/hooks";
import { Icon, type FaIcon } from "./icons.tsx";
import type { ExportFormat } from "./export.ts";

export function FormatMenu({
  icon,
  title,
  variant,
  formats,
  onPick,
  confirmIcon,
}: {
  icon: FaIcon;
  title: string;
  variant: string;
  formats: ExportFormat[];
  onPick: (f: ExportFormat) => void | Promise<void>;
  confirmIcon?: FaIcon;
}) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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

  const pick = async (f: ExportFormat): Promise<void> => {
    setOpen(false);
    try {
      await onPick(f);
    } catch {
      return; // e.g. a clipboard write rejected — don't show the confirmation
    }
    if (confirmIcon) {
      setConfirmed(true);
      window.setTimeout(() => setConfirmed(false), 1200);
    }
  };

  return (
    <div class={`menu ${variant}`}>
      <button
        type="button"
        class="ctl"
        aria-label={title}
        data-tooltip={title}
        aria-haspopup="menu"
        aria-expanded={open}
        // No stopPropagation: letting the click reach document lets any other
        // open menu's outside-click listener close it (this menu's own listener
        // is registered on a deferred timeout, so it won't self-close here).
        onClick={() => setOpen((o) => !o)}
      >
        <Icon def={confirmed && confirmIcon ? confirmIcon : icon} />
      </button>
      <ul class={open ? "menu-list" : "menu-list hidden"} role="menu">
        {formats.map((f) => (
          <li
            key={f.id}
            role="menuitem"
            tabIndex={open ? 0 : -1}
            onClick={(e) => {
              e.stopPropagation();
              void pick(f);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                void pick(f);
              }
            }}
          >
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
