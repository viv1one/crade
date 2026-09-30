"use client";

// A small tab strip for switching between a page's panels one at a time. The
// panels themselves stay mounted (the caller hides the inactive ones), so
// switching is instant and nothing refetches or loses its state.
export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="segmented">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`panel-${t.id}`}
          data-tour={`tab-${t.id}`}
          onClick={() => onChange(t.id)}
          className={`segmented-tab ${value === t.id ? "is-active" : ""}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
