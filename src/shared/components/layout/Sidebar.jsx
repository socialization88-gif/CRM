export function Sidebar({ children, className = 'sidebar', ...props }) {
  return (
    <aside className={className} {...props}>
      {children}
    </aside>
  );
}
