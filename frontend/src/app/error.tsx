"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <span className="text-4xl">😵</span>
        <h2 className="text-lg font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="text-[13px] text-foreground-muted">
          An unexpected error occurred. Try refreshing the page.
        </p>
        <button
          onClick={reset}
          className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover active:scale-[0.97]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
