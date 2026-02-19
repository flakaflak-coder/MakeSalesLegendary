import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
        <span className="text-4xl">🔍</span>
        <h2 className="text-lg font-semibold text-foreground">
          Page not found
        </h2>
        <p className="text-[13px] text-foreground-muted">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="rounded-md bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground transition-colors hover:bg-accent-hover active:scale-[0.97]"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
