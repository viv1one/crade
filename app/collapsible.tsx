// Progressive disclosure: a heading that's always visible and a body that's one
// tap away. Native <details>, so it works without JS, is keyboard accessible,
// and keeps its open/closed state while the rest of the page re-renders.
// `variant="card"` is a bordered section; `variant="inline"` is a quiet text row.
export function Collapsible({
  title,
  hint,
  children,
  defaultOpen = false,
  variant = "card",
}: {
  title: React.ReactNode;
  hint?: React.ReactNode; // small right-aligned text in the closed row (e.g. a count)
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "card" | "inline";
}) {
  return (
    <details className={`collapsible collapsible-${variant}`} open={defaultOpen}>
      <summary>
        <span className="collapsible-title">{title}</span>
        {hint != null && <span className="collapsible-hint">{hint}</span>}
      </summary>
      <div className="collapsible-body">{children}</div>
    </details>
  );
}
