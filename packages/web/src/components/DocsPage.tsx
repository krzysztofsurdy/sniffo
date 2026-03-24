import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { useDocsTree, useDocContent } from '../api/hooks';
import type { DocTreeNode } from '../api/types';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

function DocTreeItem({ node, depth, selectedPath, onSelect }: {
  node: DocTreeNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedPath;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-0.5 rounded cursor-pointer ${
          isSelected ? 'bg-surface-600 text-text-primary' : 'hover:bg-surface-700 text-text-secondary'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else if (node.path) onSelect(node.path);
        }}
      >
        {isDir ? (
          <span className="text-xs w-4 text-text-tertiary">{expanded ? '\u25BC' : '\u25B6'}</span>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-xs truncate">{node.name}</span>
      </div>
      {isDir && expanded && node.children?.map(child => (
        <DocTreeItem
          key={child.path ?? child.name}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function MermaidBlock({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
    mermaid.render(id, chart).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(() => {
      if (ref.current) ref.current.textContent = chart;
    });
  }, [chart]);

  return <div ref={ref} className="my-4 flex justify-center" />;
}

function MarkdownViewer({ content }: { content: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none px-8 py-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            if (match?.[1] === 'mermaid') {
              return <MermaidBlock chart={text} />;
            }
            if (match) {
              return (
                <pre className="bg-surface-900 rounded p-4 overflow-x-auto">
                  <code className={className} {...props}>{children}</code>
                </pre>
              );
            }
            return <code className="bg-surface-700 px-1 rounded text-text-primary" {...props}>{children}</code>;
          },
          table({ children }) {
            return <table className="border-collapse border border-border-default w-full">{children}</table>;
          },
          th({ children }) {
            return <th className="border border-border-default px-3 py-1 bg-surface-700 text-left text-text-primary">{children}</th>;
          },
          td({ children }) {
            return <td className="border border-border-default px-3 py-1">{children}</td>;
          },
          a({ href, children }) {
            return <a href={href} className="text-text-link hover:underline" target="_blank" rel="noreferrer">{children}</a>;
          },
        }}
      />
    </div>
  );
}

export default function DocsPage() {
  const { data: treeData, isLoading: treeLoading } = useDocsTree();
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: docData, isLoading: docLoading } = useDocContent(selectedPath);

  // Auto-select first file
  useEffect(() => {
    if (treeData?.tree && !selectedPath) {
      const findFirst = (nodes: DocTreeNode[]): string | null => {
        for (const n of nodes) {
          if (n.type === 'file' && n.path) return n.path;
          if (n.children) {
            const found = findFirst(n.children);
            if (found) return found;
          }
        }
        return null;
      };
      const first = findFirst(treeData.tree);
      if (first) setSelectedPath(first);
    }
  }, [treeData, selectedPath]);

  return (
    <div className="flex-1 flex overflow-hidden">
      <aside className="w-[280px] bg-surface-800 border-r border-border-default overflow-y-auto">
        <div className="p-3">
          <p className="text-text-tertiary text-xs mb-2 uppercase tracking-wide">Documents</p>
          {treeLoading ? (
            <p className="text-text-tertiary text-xs">Loading...</p>
          ) : treeData?.tree.length === 0 ? (
            <p className="text-text-tertiary text-xs">No markdown files found</p>
          ) : (
            treeData?.tree.map(node => (
              <DocTreeItem
                key={node.path ?? node.name}
                node={node}
                depth={0}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
              />
            ))
          )}
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto bg-surface-900">
        {!selectedPath ? (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            Select a document from the sidebar
          </div>
        ) : docLoading ? (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            Loading document...
          </div>
        ) : docData ? (
          <MarkdownViewer content={docData.content} />
        ) : null}
      </div>
    </div>
  );
}
