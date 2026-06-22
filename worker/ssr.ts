// Inject per-scheme <title>/description/Open Graph/Twitter meta into index.html
// so shared links and crawlers get the scheme name, an evocative description, and
// the palette OG image. The SPA still hydrates and takes over on top of this.
import type { Env } from "./env.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface IndexedScheme {
  name: string;
  tags: string[];
  slug: string;
}

export async function ssr(request: Request, env: Env, url: URL): Promise<Response> {
  try {
    const htmlRes = await env.ASSETS.fetch(`${url.origin}/index.html`);
    let html = await htmlRes.text();

    const slug = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    let scheme: IndexedScheme | undefined;
    if (slug) {
      const idxRes = await env.ASSETS.fetch(`${url.origin}/index.json`);
      if (idxRes.ok) {
        const idx = (await idxRes.json()) as { schemes: IndexedScheme[] };
        scheme = idx.schemes.find((s) => s.slug === slug);
      }
    }

    const title = scheme ? `${scheme.name} — color.recipes` : "color.recipes";
    const description = scheme
      ? `${scheme.name} — a color scheme evoking ${scheme.tags.join(", ")}.`
      : "A searchable, curated color-scheme gallery with AI-assisted PR contributions.";
    const ogTitle = scheme ? scheme.name : "color.recipes";
    const ogImage = scheme ? `${url.origin}/og/${scheme.slug}.png` : "";

    const meta = [
      `<meta property="og:type" content="website">`,
      `<meta property="og:url" content="${esc(`${url.origin}${url.pathname}`)}">`,
      `<meta property="og:title" content="${esc(ogTitle)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      ...(ogImage ? [`<meta property="og:image" content="${esc(ogImage)}">`] : []),
      `<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">`,
      `<meta name="twitter:title" content="${esc(ogTitle)}">`,
      `<meta name="twitter:description" content="${esc(description)}">`,
      ...(ogImage ? [`<meta name="twitter:image" content="${esc(ogImage)}">`] : []),
    ].join("\n    ");

    html = html
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
      .replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${esc(description)}">`)
      .replace("</head>", `    ${meta}\n  </head>`);

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch {
    return env.ASSETS.fetch(request); // fall back to the raw SPA shell
  }
}
