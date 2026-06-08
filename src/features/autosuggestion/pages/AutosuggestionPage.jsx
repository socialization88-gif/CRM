export function AutosuggestionPage() {
  return (
    <section id="autosuggestionView" className="view admin-only block">
      <iframe id="autosuggestionFrame" src="/autosuggestion-source" title="Autosuggestion" />
    </section>
  );
}
