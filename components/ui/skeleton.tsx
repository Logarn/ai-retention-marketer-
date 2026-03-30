import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-white/8 bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03]",
        className,
      )}
    />
  );
}
