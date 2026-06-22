// Font Awesome Pro icons as a Preact component. We import only the icon
// definitions (tree-shaken) and render an inline <svg> from their path data —
// no fontawesome-svg-core runtime. Color comes from `currentColor`; size from
// the shared `.fa-icon` rule (height: 1em).
import {
  faChevronDown,
  faXmark,
  faArrowRight,
  faCheck,
  faDownload,
} from "@fortawesome/pro-solid-svg-icons";

type FaIcon = typeof faChevronDown;

export const ICONS = {
  chevronDown: faChevronDown,
  xmark: faXmark,
  arrowRight: faArrowRight,
  check: faCheck,
  download: faDownload,
};

// def.icon = [width, height, ligatures, unicode, pathData]; pathData is a string
// for single-path styles (an array only for duotone, which we don't use).
function pathData(def: FaIcon): string {
  const d = def.icon[4];
  return Array.isArray(d) ? d.join(" ") : d;
}

export function Icon({ def, class: cls }: { def: FaIcon; class?: string }) {
  return (
    <svg
      class={["fa-icon", `fa-${def.iconName}`, cls].filter(Boolean).join(" ")}
      viewBox={`0 0 ${def.icon[0]} ${def.icon[1]}`}
      aria-hidden="true"
      focusable="false"
    >
      <path fill="currentColor" d={pathData(def)} />
    </svg>
  );
}
