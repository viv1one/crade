"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-black/50 dark:text-white/50 max-w-md">{error.message}</p>
      <button
        onClick={reset}
        className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-[#383838] dark:hover:bg-[#ccc] transition-colors"
      >
        Try again
      </button>
    </div>
  );
}
