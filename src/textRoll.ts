// "Text roll" effect (charcode/sequence interpolation): morph text from one
// string to another by rolling each character position through an ordered
// sequence. Ported from the standalone bench (the self-contained CORE).
//
// Each position interpolates along a path of characters: within the same
// sequence (latin/kana) it walks the sequence; blank<->char rises/falls from the
// start; kanji<->kanji scrambles through a frequent-kanji pool; anything else
// switches directly. All positions advance in lockstep over `duration`.

export type Easing = (t: number) => number;

export const EASINGS: Record<string, Easing> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t * t * t,
  easeOutCubic: (t) => --t * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInOutBack: (t) => {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (t * 2 - 2) + c) + 2) / 2;
  },
};

// Ordered "rails" a character can roll along (only within one rail, so no
// punctuation/case gaps appear).
const SEQS = {
  latin: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890",
  hira: "あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん",
  kata: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
};
const SEQLIST = Object.values(SEQS);
const seqOf = (ch: string): string | null => SEQLIST.find((s) => s.includes(ch)) ?? null;
const isBlank = (ch: string): boolean => ch === " " || ch === "　";
const blankFor = (seq: string): string => (seq === SEQS.hira || seq === SEQS.kata ? "　" : " ");
const isCJK = (ch: string): boolean => {
  const c = ch.codePointAt(0) ?? 0;
  return c >= 0x3400 && c <= 0x9fff;
};

// kanji<->kanji: scramble only within this frequent-kanji pool (no tofu).
const KANJI =
  "日一国人年大十二本中長出三同時政事自行社見月分議後前民生連五発間対上部東者党地合市業内相方四定今回新場金員九入選立開手米力学問高代明実円関決子動京全目表戦経通外最言氏現理調体化田当八六約主題下首意法不来作性的要用制治度務強気小七成期公持野協取都和統以機平総加山思家話世受区領多県続進正安設保改数記院女初北午指権心界支第産結株次元気水火木金土空海川花草犬猫鳥魚肉茶酒店駅道路車電愛夢光星雲雨雪風春夏秋冬朝昼夜父母兄弟姉妹友達男女子供町村府県市島山田森林口目耳手足頭顔体白黒赤青黄緑色音声映画歌詞物語世界平和自由幸福愛情友情家族仕事会社学校教育文化歴史科学技術自然環境社会経済政治法律医療健康病気薬食事料理野菜果物";
const KANJI_CAP = 20;

function cjkPath(a: string, b: string): string[] {
  const L = KANJI.length;
  const cp = a.codePointAt(0) ?? 0;
  const seed = (cp * 131) % L;
  const stride = 29 + (cp % 17);
  const p = [a];
  for (let k = 1; k < KANJI_CAP; k++) p.push(KANJI[(seed + k * stride) % L]);
  p.push(b);
  return p;
}

// The character path (source -> target states) for a single position. Exported
// for unit testing the per-position morph logic.
export function charPath(a: string, b: string): string[] {
  if (a === b) return [a];
  const sa = seqOf(a);
  const sb = seqOf(b);
  if (sa && sa === sb) {
    const ia = sa.indexOf(a);
    const ib = sa.indexOf(b);
    const step = ia < ib ? 1 : -1;
    const p: string[] = [];
    for (let i = ia; i !== ib + step; i += step) p.push(sa[i]);
    return p;
  }
  if (isBlank(a) && sb) {
    const ib = sb.indexOf(b);
    const p = [blankFor(sb)];
    for (let i = 0; i <= ib; i++) p.push(sb[i]);
    return p;
  }
  if (isBlank(b) && sa) {
    const ia = sa.indexOf(a);
    const p: string[] = [];
    for (let i = ia; i >= 0; i--) p.push(sa[i]);
    p.push(blankFor(sa));
    return p;
  }
  if (isCJK(a) && isCJK(b)) return cjkPath(a, b);
  return [a, b];
}

export interface RollOptions {
  duration?: number;
  easing?: Easing;
}

/** Animate `el`'s text from `from` to `to`. Returns a cancel function. */
export function rollText(el: HTMLElement, from: string, to: string, opts: RollOptions = {}): () => void {
  const { duration = 1200, easing = EASINGS.easeInOutSine } = opts;
  const len = Math.max(from.length, to.length);
  const f = [...from.padEnd(len, " ")];
  const t = [...to.padEnd(len, " ")];
  const paths = f.map((c, i) => charPath(c, t[i]));
  const N = Math.max(1, ...paths.map((p) => p.length - 1));

  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = to;
    return () => {};
  }

  const start = performance.now();
  let raf = 0;
  let alive = true;

  function frame(now: number): void {
    if (!alive) return;
    const p = Math.min((now - start) / duration, 1);
    const e = easing(p);
    const k = Math.round(Math.max(0, Math.min(N, e * N)));
    let out = "";
    for (const path of paths) out += path[Math.min(k, path.length - 1)];
    el.textContent = out;
    if (p < 1) raf = requestAnimationFrame(frame);
    else el.textContent = to;
  }
  raf = requestAnimationFrame(frame);
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
  };
}
