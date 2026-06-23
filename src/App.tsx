// The whole app, mounted into a single #app root. The top bar (brand + search)
// and the main content area are both Preact; they react to the state signals.
import { index, loadError, matched, activeTags, startSlug } from "./state.ts";
import { Search } from "./Search.tsx";
import { Gallery } from "./Gallery.tsx";
import { Contribution } from "./Contribution.tsx";
import { Icon, ICONS } from "./icons.tsx";

function Topbar() {
  return (
    <header class="topbar">
      <a class="brand" href="/" aria-label="color.recipes home">
        <Icon def={ICONS.swatchbook} class="brand-mark" />
      </a>
      <Search />
    </header>
  );
}

function MainView() {
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

export function App() {
  return (
    <>
      <Topbar />
      <main class="app">
        <MainView />
      </main>
    </>
  );
}
