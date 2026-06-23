// Scheme export: download the displayed palette in various developer formats.
// Everything is generated client-side; Xcode asset catalogs are emitted as a small
// store-only ZIP (no dependency).

import type { IndexedScheme } from "./types.ts";
import { hexToRgb, hexToOklch, luminance } from "./color.ts";

export interface ExportFormat {
  id: string;
  label: string;
  /** True for non-text archives (e.g. the .xcassets zip) — excluded from "copy". */
  binary?: boolean;
  generate(scheme: IndexedScheme): { filename: string; blob: Blob };
}

const enc = new TextEncoder();

function textBlob(text: string, mime: string): Blob {
  return new Blob([text], { type: `${mime};charset=utf-8` });
}

const camel = (slug: string): string => slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const snake = (slug: string): string => slug.replace(/-/g, "_");
const f3 = (n: number): string => (n / 255).toFixed(3);

interface Roles {
  darkest: string;
  paper: string;
  lightest: string;
  primary: string;
  secondary: string;
}
function roles(colors: string[]): Roles {
  const byLum = [...colors].sort((a, b) => luminance(a) - luminance(b));
  const byChroma = [...colors].sort((a, b) => hexToOklch(b).c - hexToOklch(a).c);
  return {
    darkest: byLum[0],
    paper: byLum[1] ?? byLum[0],
    lightest: byLum[byLum.length - 1],
    primary: byChroma[0],
    secondary: byChroma[1] ?? byChroma[0],
  };
}

// ---------- minimal store-only ZIP ----------
function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

/** Copy into a fresh ArrayBuffer-backed view (keeps Blob's BlobPart typing happy). */
function ab(src: ArrayLike<number>): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = ab(enc.encode(file.name));
    const data = ab(file.data);
    const crc = crc32(data);

    const lhBytes = new Uint8Array(30);
    const lh = new DataView(lhBytes.buffer);
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameBytes.length, true);
    parts.push(lhBytes, nameBytes, data);

    const chBytes = new Uint8Array(46);
    const ch = new DataView(chBytes.buffer);
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint32(42, offset, true);
    central.push(chBytes, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const eocdBytes = new Uint8Array(22);
  const eocd = new DataView(eocdBytes.buffer);
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...central, eocdBytes], { type: "application/zip" });
}

// ---------- formats ----------
export const FORMATS: ExportFormat[] = [
  {
    id: "json",
    label: "JSON (scheme)",
    generate: (s) => {
      const { slug: _slug, ...scheme } = s;
      return { filename: `${s.slug}.json`, blob: textBlob(JSON.stringify(scheme, null, 2) + "\n", "application/json") };
    },
  },
  {
    id: "css",
    label: "CSS variables",
    generate: (s) => {
      const lines = s.colors.map((c, i) => `  --${s.slug}-${i + 1}: ${c};`).join("\n");
      return {
        filename: `${s.slug}.css`,
        blob: textBlob(`:root {\n  /* ${s.name} — color.recipes */\n${lines}\n}\n`, "text/css"),
      };
    },
  },
  {
    id: "scss",
    label: "SCSS variables",
    generate: (s) => {
      const lines = s.colors.map((c, i) => `$${s.slug}-${i + 1}: ${c};`).join("\n");
      return { filename: `${s.slug}.scss`, blob: textBlob(`// ${s.name} — color.recipes\n${lines}\n`, "text/x-scss") };
    },
  },
  {
    id: "svg",
    label: "SVG swatches",
    generate: (s) => {
      const w = 120;
      const total = s.colors.length * w;
      const rects = s.colors
        .map(
          (c, i) =>
            `  <rect x="${i * w}" y="0" width="${w}" height="120" fill="${c}"/>\n` +
            `  <text x="${i * w + w / 2}" y="146" font-family="monospace" font-size="13" text-anchor="middle" fill="#777">${c}</text>`,
        )
        .join("\n");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="160" viewBox="0 0 ${total} 160">\n  <title>${s.name} — color.recipes</title>\n${rects}\n</svg>\n`;
      return { filename: `${s.slug}.svg`, blob: textBlob(svg, "image/svg+xml") };
    },
  },
  {
    id: "android",
    label: "Android (colors.xml)",
    generate: (s) => {
      const lines = s.colors.map((c, i) => `  <color name="${snake(s.slug)}_${i + 1}">${c.toUpperCase()}</color>`).join("\n");
      const xml = `<?xml version="1.0" encoding="utf-8"?>\n<!-- ${s.name} — color.recipes -->\n<resources>\n${lines}\n</resources>\n`;
      return { filename: `${s.slug}-colors.xml`, blob: textBlob(xml, "application/xml") };
    },
  },
  {
    id: "xcassets",
    label: "Xcode color assets (.xcassets)",
    binary: true,
    generate: (s) => {
      const dir = `${s.slug}.xcassets`;
      const files: { name: string; data: Uint8Array }[] = [
        { name: `${dir}/Contents.json`, data: enc.encode(JSON.stringify({ info: { author: "xcode", version: 1 } }, null, 2)) },
      ];
      s.colors.forEach((c, i) => {
        const { r, g, b } = hexToRgb(c);
        const contents = {
          colors: [
            {
              idiom: "universal",
              color: { "color-space": "srgb", components: { red: f3(r), green: f3(g), blue: f3(b), alpha: "1.000" } },
            },
          ],
          info: { author: "xcode", version: 1 },
        };
        files.push({ name: `${dir}/${s.slug}-${i + 1}.colorset/Contents.json`, data: enc.encode(JSON.stringify(contents, null, 2)) });
      });
      return { filename: `${s.slug}.xcassets.zip`, blob: zipStore(files) };
    },
  },
  {
    id: "swift",
    label: "Swift (SwiftUI Color)",
    generate: (s) => {
      const ext = s.colors
        .map((c, i) => {
          const { r, g, b } = hexToRgb(c);
          return `    static let ${camel(s.slug)}${i + 1} = Color(red: ${f3(r)}, green: ${f3(g)}, blue: ${f3(b)})`;
        })
        .join("\n");
      return {
        filename: `${s.slug}.swift`,
        blob: textBlob(`import SwiftUI\n\n// ${s.name} — color.recipes\nextension Color {\n${ext}\n}\n`, "text/x-swift"),
      };
    },
  },
  {
    id: "mui",
    label: "MUI theme",
    generate: (s) => {
      const r = roles(s.colors);
      const body =
        `import { createTheme } from '@mui/material/styles';\n\n` +
        `// ${s.name} — color.recipes\n` +
        `export const ${camel(s.slug)}Theme = createTheme({\n` +
        `  palette: {\n` +
        `    primary: { main: '${r.primary}' },\n` +
        `    secondary: { main: '${r.secondary}' },\n` +
        `    background: { default: '${r.darkest}', paper: '${r.paper}' },\n` +
        `    text: { primary: '${r.lightest}' },\n` +
        `  },\n});\n\n` +
        `export const ${camel(s.slug)}Colors = ${JSON.stringify(s.colors)} as const;\n`;
      return { filename: `${s.slug}.mui.ts`, blob: textBlob(body, "text/typescript") };
    },
  },
  {
    id: "antd",
    label: "Ant Design theme",
    generate: (s) => {
      const r = roles(s.colors);
      const body =
        `import type { ThemeConfig } from 'antd';\n\n` +
        `// ${s.name} — color.recipes\n` +
        `export const ${camel(s.slug)}Theme: ThemeConfig = {\n` +
        `  token: {\n` +
        `    colorPrimary: '${r.primary}',\n` +
        `    colorBgBase: '${r.darkest}',\n` +
        `    colorTextBase: '${r.lightest}',\n` +
        `  },\n};\n\n` +
        `export const ${camel(s.slug)}Colors = ${JSON.stringify(s.colors)};\n`;
      return { filename: `${s.slug}.antd.ts`, blob: textBlob(body, "text/typescript") };
    },
  },
  {
    id: "tailwind",
    label: "Tailwind config",
    generate: (s) => {
      const entries = s.colors.map((c, i) => `          '${i + 1}': '${c}',`).join("\n");
      const body =
        `// ${s.name} — color.recipes\n` +
        `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n        ${camel(s.slug)}: {\n${entries}\n        },\n      },\n    },\n  },\n};\n`;
      return { filename: `${s.slug}.tailwind.js`, blob: textBlob(body, "text/javascript") };
    },
  },
];

export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
