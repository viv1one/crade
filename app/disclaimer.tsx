import { Collapsible } from "./collapsible";

// `collapsible` is for the page-footer fine print (data sources, "simulated
// only"): out of the way but one tap from being read. Leave it off for a
// disclaimer that sits next to AI output or a directive verdict — that one
// should always be visible.
export function Disclaimer({ children, collapsible = false }: { children: React.ReactNode; collapsible?: boolean }) {
  if (collapsible) {
    return (
      <Collapsible variant="inline" title="ⓘ About this data">
        <p className="text-xs text-foreground-muted">{children}</p>
      </Collapsible>
    );
  }
  return <p className="text-xs text-foreground-muted">{children}</p>;
}
