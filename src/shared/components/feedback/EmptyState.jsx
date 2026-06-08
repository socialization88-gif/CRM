export function EmptyState({ children = 'No data found' }) {
  return <div className="empty">{children}</div>;
}
