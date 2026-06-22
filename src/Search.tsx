// Tokenized tag field with typeahead. `activeTags` (a signal) is the source of
// truth, rendered as removable chips; the text input holds only the in-progress
// query. Suggestions are tags that co-occur with the current selection (adding
// one never dead-ends), most-common first, shown only while focused.
import { useState, useRef } from "preact/hooks";
import { activeTags, matched, isKnownTag, addTag, removeTag } from "./state.ts";
import { Icon, ICONS } from "./icons.tsx";

interface Candidate {
  tag: string;
  count: number;
}

function computeCandidates(partial: string): Candidate[] {
  const sel = new Set(activeTags.value);
  const ms = matched.value;
  if (!ms.length) return [];
  const counts = new Map<string, number>();
  for (const s of ms) {
    for (const t of s.tags) {
      if (sel.has(t)) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const q = partial.toLowerCase();
  let entries = [...counts.entries()];
  if (q) entries = entries.filter(([t]) => t.includes(q));
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries.map(([tag, count]) => ({ tag, count }));
}

export function Search() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = computeCandidates(query.trim());
  const visible = open && candidates.length > 0;

  const commit = (raw: string): void => {
    addTag(raw);
    setQuery("");
  };

  return (
    <form
      id="search"
      class="search"
      autocomplete="off"
      role="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <div
        id="tokens"
        class="tokens"
        onClick={(e) => {
          if (e.target === e.currentTarget) inputRef.current?.focus();
        }}
      >
        {activeTags.value.map((tag) => (
          <span key={tag} class={isKnownTag(tag) ? "token" : "token token--unknown"}>
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
            >
              <Icon def={ICONS.xmark} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id="search-input"
          class="token-input"
          type="text"
          placeholder="Search by tag — type, pick a suggestion, or press Enter…"
          aria-label="Search by tag"
          role="combobox"
          aria-expanded={visible ? "true" : "false"}
          aria-autocomplete="list"
          aria-controls="suggest"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          onFocus={() => setOpen(true)}
          onBlur={() =>
            window.setTimeout(() => {
              if (document.activeElement !== inputRef.current) setOpen(false);
            }, 120)
          }
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (query.trim()) commit(query);
            } else if (e.key === "Backspace" && !query && activeTags.value.length) {
              e.preventDefault();
              removeTag(activeTags.value[activeTags.value.length - 1]);
            } else if (e.key === "Escape") {
              inputRef.current?.blur();
            }
          }}
        />
      </div>
      <ul
        id="suggest"
        class={visible ? "suggest" : "suggest hidden"}
        role="listbox"
        aria-label="Tag suggestions"
      >
        {visible &&
          candidates.map((c) => (
            <li
              key={c.tag}
              role="option"
              class="sg"
              // mousedown (not click) so the input doesn't blur before we add the tag
              onMouseDown={(e) => {
                e.preventDefault();
                commit(c.tag);
              }}
            >
              {c.tag}
              <span class="count">{c.count}</span>
            </li>
          ))}
      </ul>
    </form>
  );
}
