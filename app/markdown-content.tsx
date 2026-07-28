"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

// Minimal styling to match the app's existing text-sm, tight-spacing look —
// there's no Tailwind Typography plugin here, so this is hand-styled rather
// than a `prose` class.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-2 last:mb-0 list-disc pl-5 flex flex-col gap-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 last:mb-0 list-decimal pl-5 flex flex-col gap-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="bg-black/[.06] dark:bg-white/[.08] rounded px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed [&>*:last-child]:mb-0">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
