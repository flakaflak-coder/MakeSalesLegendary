"use client";

import { useMemo, useState, type ReactNode } from "react";
import { getRandomGif, getRandomQuote, salesGifs } from "@/lib/sales-gifs";

interface EmptyStateProps {
  title: string;
  description: string;
  gifCategory?: keyof typeof salesGifs;
  children?: ReactNode;
}

export function EmptyState({ title, description, gifCategory, children }: EmptyStateProps) {
  const [gifFailed, setGifFailed] = useState(false);

  const gifUrl = useMemo(
    () => (gifCategory ? getRandomGif(gifCategory) : null),
    [gifCategory]
  );

  const quote = useMemo(() => getRandomQuote(), []);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {gifUrl && !gifFailed && (
        <div className="mb-6 overflow-hidden rounded-xl border border-border-subtle shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gifUrl}
            alt="Sales mood"
            className="h-48 w-auto object-cover"
            loading="lazy"
            onError={() => setGifFailed(true)}
          />
        </div>
      )}

      <h3 className="text-lg font-semibold text-foreground">
        {title}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm text-foreground-muted">
        {description}
      </p>

      <blockquote className="mt-5 max-w-md border-l-2 border-accent-border pl-3 text-left">
        <p className="text-[13px] italic text-foreground-secondary">
          &ldquo;{quote.text}&rdquo;
        </p>
        <footer className="mt-0.5 text-[11px] text-foreground-faint">
          &mdash; {quote.attribution}
        </footer>
      </blockquote>

      {children && (
        <div className="mt-6">
          {children}
        </div>
      )}
    </div>
  );
}
