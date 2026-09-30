import { AppShellNav } from "../app-shell-nav";
import { HoldingsPanel } from "./holdings-panel";

export default function HoldingsPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-6 p-6 pb-24 sm:p-12">
      <AppShellNav />
      <main className="contents">
        <HoldingsPanel />
      </main>
    </div>
  );
}
