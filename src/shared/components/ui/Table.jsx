export function Table({ children, className = '', ...props }) {
  return (
    <div className="table-scroll">
      <table className={className || undefined} {...props}>
        {children}
      </table>
    </div>
  );
}
