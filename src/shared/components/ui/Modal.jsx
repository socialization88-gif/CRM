export function Modal({ open, children, className = 'modal-back', ...props }) {
  if (!open) return null;
  return (
    <div className={className} style={{ display: 'flex' }} {...props}>
      {children}
    </div>
  );
}
