export function Button({ children, className = '', type = 'button', ...props }) {
  return (
    <button type={type} className={className || undefined} {...props}>
      {children}
    </button>
  );
}
