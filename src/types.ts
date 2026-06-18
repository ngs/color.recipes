// Shape of public/index.json (produced by scripts/build-index.ts, read by the client).
import type { Scheme } from "./validate.ts";

export interface IndexedScheme extends Scheme {
  slug: string;
}

export interface SchemeIndex {
  version: 1;
  schemes: IndexedScheme[];
  /** tag -> number of schemes carrying it. */
  tags: Record<string, number>;
}
