// The main content root (#app): the gallery when schemes match the filter, the
// contribution flow when none do, an error panel if the index failed to load.
// It reacts to the state signals; the search field is a separate root (main.tsx).
import { index, loadError, matched, activeTags, startSlug } from "./state.ts";
import { Gallery } from "./Gallery.tsx";
import { Contribution } from "./Contribution.tsx";

export function MainView() {
  if (loadError.value) {
    return (
      <div class="panel">
        <h1>Failed to load gallery</h1>
        <p>Could not fetch the scheme index.</p>
      </div>
    );
  }
  if (!index.value) return null; // still loading

  const list = matched.value;
  if (!list.length) return <Contribution tags={activeTags.value} />;

  // Remount the gallery when the filter or the deep-link slug changes so it
  // reshuffles and starts on the right scheme.
  const key = `${activeTags.value.join(",")}|${startSlug.value}`;
  return <Gallery key={key} schemes={list} startSlug={startSlug.value} />;
}
