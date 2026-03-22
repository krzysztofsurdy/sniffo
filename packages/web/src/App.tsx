export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-surface-900">
      <header className="h-10 flex items-center px-4 bg-surface-800 border-b border-border-default">
        <h1 className="text-sm font-semibold text-text-primary">Contextualizer</h1>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-text-secondary">
          Graph canvas will render here
        </div>
      </main>
    </div>
  );
}
