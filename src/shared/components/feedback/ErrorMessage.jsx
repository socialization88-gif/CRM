export function ErrorMessage({ message }) {
  if (!message) return null;
  return <div className="empty">{message}</div>;
}
