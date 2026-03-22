import { useNavigationStore } from '../store';

export default function LevelNavigator() {
  const breadcrumbs = useNavigationStore((s) => s.breadcrumbs);
  const drillUp = useNavigationStore((s) => s.drillUp);

  if (breadcrumbs.length <= 1) return null;

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-surface-800/90 rounded-md px-2 py-1 border border-border-default">
      {breadcrumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-text-tertiary text-xs">&gt;</span>}
          {i < breadcrumbs.length - 1 ? (
            <button
              onClick={() => drillUp(i)}
              className="text-text-link text-xs hover:underline"
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-text-primary text-xs font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}
