"use client";

import { useEffect } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

// Minimal modal primitive — no toast/dialog/sheet system existed anywhere
// in this codebase before this (confirmed via search). Built plain (fixed
// backdrop + slide-up panel, CSS transition, no portal) rather than adding
// a dependency, since this is the one place in the whole UI/UX spec where
// a real overlay is warranted: the Screener's "Summon Agents" interaction
// is the spec's own headline "Decide" moment. Everywhere else in the app
// keeps using the inline-dismissible-card pattern already established
// (JournalReview, the post-trade prompt) rather than reaching for this.
export function BottomSheet({ open, onClose, children, title }: BottomSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-[1px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card relative w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-b-none sm:rounded-b-[15px] p-4 flex flex-col gap-3 sheet-panel"
      >
        <div className="flex items-center justify-between">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-sm text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
