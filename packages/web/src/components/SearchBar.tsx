import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearch } from '../api/hooks';
import { useUIStore } from '../store';
import { getNodeColor } from '../lib/node-colors';

export default function SearchBar() {
  const [inputValue, setInputValue] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusSearchResult = useUIStore((s) => s.focusSearchResult);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const { data: results } = useSearch(debouncedQuery);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelect = useCallback((nodeId: string) => {
    focusSearchResult(nodeId);
    setIsOpen(false);
    setInputValue('');
  }, [focusSearchResult]);

  return (
    <div className="relative w-80">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search symbols... (press /)"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className="w-full h-8 px-3 text-sm bg-surface-700 border border-border-default rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-link"
      />
      {isOpen && results && results.length > 0 && (
        <div className="absolute top-9 left-0 right-0 bg-surface-600 border border-border-default rounded-md shadow-lg max-h-64 overflow-y-auto z-50">
          {results.slice(0, 20).map((node) => (
            <button
              key={node.id}
              onClick={() => handleSelect(node.id)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-surface-700 flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: getNodeColor(node.type) }}
              />
              <span className="text-text-primary truncate">{node.shortName}</span>
              <span className="text-text-tertiary text-xs truncate ml-auto">{node.qualifiedName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
