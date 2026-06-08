export function Card({ children, className = 'card', ...props }) {
  return (
    <section className={className} {...props}>
      {children}
    </section>
  );
}
