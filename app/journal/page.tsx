"use client";

import { AppNav } from "../app-nav";
import { JournalPanel } from "./journal-panel";

export default function JournalPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 sm:p-20">
      <AppNav />
      <main className="contents">
        <JournalPanel />
      </main>
    </div>
  );
}
