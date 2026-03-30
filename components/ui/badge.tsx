import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[linear-gradient(135deg,#ff7b42,#ffa061)] text-[#22120a] shadow-[0_8px_20px_-14px_rgba(255,132,74,0.85)]",
  secondary: "border border-white/10 bg-white/5 text-slate-200",
  outline: "border border-white/20 bg-transparent text-slate-300",
  success: "border border-emerald-300/30 bg-emerald-300/15 text-emerald-100",
  warning: "border border-amber-300/30 bg-amber-300/16 text-amber-100",
  destructive: "border border-red-300/30 bg-red-300/15 text-red-100",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  );
}
