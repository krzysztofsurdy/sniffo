import { useState } from 'react';
import GraphCanvas from './components/GraphCanvas';
// import SearchBar from './components/SearchBar';
import DetailPanel from './components/DetailPanel';
import FilterPanel from './components/FilterPanel';
import FreshnessBar from './components/FreshnessBar';
import KeyboardShortcuts from './components/KeyboardShortcuts';
import DocsPage from './components/DocsPage';

type Tab = 'graph' | 'docs';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('graph');

  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <KeyboardShortcuts />
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default gap-4">
        <h1 className="text-sm font-semibold text-text-primary">Sniffo</h1>
        <nav className="flex gap-1">
          {(['graph', 'docs'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-xs rounded capitalize ${
                activeTab === tab
                  ? 'bg-surface-600 text-text-primary font-medium'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </header>
      {activeTab === 'graph' && <FreshnessBar />}
      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'graph' ? (
          <>
            <FilterPanel />
            <GraphCanvas />
            <DetailPanel />
          </>
        ) : (
          <DocsPage />
        )}
      </main>
    </div>
  );
}
