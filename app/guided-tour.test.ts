import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { TOUR_STEPS } from "./guided-tour";

// The tour finds its targets by plain selectors, so renaming an id or a nav
// link would silently break a step (the spotlight just wouldn't appear).
// This ties each step's selector to the source that has to provide it.
function read(rel: string): string {
  return fs.readFileSync(path.join(__dirname, rel), "utf8");
}

const nav = read("app-shell-nav.tsx");
const pageSources = ["watchlist.tsx", "portfolio.tsx", "chat-panel.tsx"].map(read).join("\n");

describe("guided tour targets", () => {
  for (const step of TOUR_STEPS) {
    it(`"${step.title}" target still exists in the source`, () => {
      const idMatch = step.target.match(/^#([\w-]+)/);
      const linkMatch = step.target.match(/^\[data-tour="link-(.+)"\]$/);
      if (idMatch) {
        expect(pageSources).toContain(`id="${idMatch[1]}"`);
      } else if (linkMatch) {
        expect(nav).toContain(`href: "${linkMatch[1]}"`); // the nav still lists this route
        expect(nav).toContain("data-tour={`link-${l.href}`}"); // and stamps it as a tour target
      } else {
        throw new Error(`Unrecognized tour selector: ${step.target}`);
      }
    });

    if (step.openNav) {
      it(`"${step.title}" opens a nav group that exists`, () => {
        expect(nav).toContain(`key: "${step.openNav}"`);
      });
    }
  }
});
