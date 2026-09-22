import { AppShellNav } from "../app-shell-nav";
import { HoldingsPanel } from "./holdings-panel";

export default function HoldingsPage() {
  return (
    <div className="font-sans min-h-screen flex flex-col items-center gap-16 p-8 pb-20 sm:p-20">
      <AppShellNav />
      <main className="contents">
        <HoldingsPanel />
      </main>
    </div>
  );
}
