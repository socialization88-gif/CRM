export function Header({ children, className = 'header', ...props }) {
  return (
    <header className={className} {...props}>
      {children}
    </header>
  );
}
