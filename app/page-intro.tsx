// One-line "what is this page for" under a page's title, so the seven
// research/practice/tracking pages don't have to be told apart by name
// alone. `kind` mirrors the nav's Research / Practice / Track grouping.
const KIND_LABEL = { research: "Research", practice: "Practice", track: "Track" } as const;

export function PageIntro({ kind, children }: { kind: keyof typeof KIND_LABEL; children: React.ReactNode }) {
  return (
    <p className="text-sm text-foreground-muted -mt-3">
      <span className="badge badge-neutral mr-2 align-middle">{KIND_LABEL[kind]}</span>
      {children}
    </p>
  );
}
