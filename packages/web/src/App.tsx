import GraphCanvas from './components/GraphCanvas';
import SearchBar from './components/SearchBar';
import DetailPanel from './components/DetailPanel';
import FilterPanel from './components/FilterPanel';
import FreshnessBar from './components/FreshnessBar';
import KeyboardShortcuts from './components/KeyboardShortcuts';

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <KeyboardShortcuts />
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default gap-4">
        <h1 className="text-sm font-semibold text-text-primary">Contextualizer</h1>
        <SearchBar />
      </header>
      <FreshnessBar />
      <main className="flex-1 flex overflow-hidden">
        <FilterPanel />
        <GraphCanvas />
        <DetailPanel />
      </main>
    </div>
  );
}
