export function Badge({ children, className = 'pill', ...props }) {
  return (
    <span className={className} {...props}>
      {children}
    </span>
  );
}
