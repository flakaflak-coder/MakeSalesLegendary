import { type ReactNode } from "react";

interface PageHeaderProps {
  emoji: string;
  title: string;
  description: string;
  children?: ReactNode;
}

export function PageHeader({ emoji, title, description, children }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.75rem] font-bold tracking-tight text-foreground">
          {emoji} {title}
        </h1>
        <p className="mt-1 max-w-lg text-[15px] leading-relaxed text-foreground-secondary">
          {description}
        </p>
      </div>
      {children && (
        <div className="shrink-0">
          {children}
        </div>
      )}
    </div>
  );
}
