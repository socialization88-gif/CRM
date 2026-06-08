export function Toolbar({ children, className = 'toolbar', ...props }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}
