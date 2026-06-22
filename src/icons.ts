// Font Awesome Pro icons rendered as inline SVG (vanilla — no React, no webfont
// CSS, and no fontawesome-svg-core runtime). We import only the icon
// definitions (tree-shaken to the few used here) and build the <svg> from their
// path data. Every icon inherits color via `fill="currentColor"` and is sized
// by the shared `.fa-icon` rule (height: 1em).
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

const SVG_NS = "http://www.w3.org/2000/svg";

// def.icon = [width, height, ligatures, unicode, pathData]; pathData is a string
// for single-path styles (an array only for duotone, which we don't use here).
function pathData(def: FaIcon): string {
  const d = def.icon[4];
  return Array.isArray(d) ? d.join(" ") : d;
}

export function iconNode(def: FaIcon, classes: string[] = []): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", ["fa-icon", `fa-${def.iconName}`, ...classes].join(" "));
  svg.setAttribute("viewBox", `0 0 ${def.icon[0]} ${def.icon[1]}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", pathData(def));
  svg.appendChild(path);
  return svg;
}
