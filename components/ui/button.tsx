import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium tracking-tight transition-all",
        "disabled:cursor-not-allowed disabled:opacity-55",
        variant === "default" &&
          "bg-[linear-gradient(135deg,#ff8d57_0%,#ff6f3a_48%,#ff5d63_100%)] text-[#1a120e] shadow-[0_10px_26px_-14px_rgba(255,124,66,0.95)] hover:brightness-105",
        variant === "outline" &&
          "border border-[rgba(148,163,184,0.3)] bg-[rgba(15,20,30,0.74)] text-slate-100 hover:border-[rgba(255,132,74,0.45)] hover:bg-[rgba(21,27,39,0.9)]",
        variant === "ghost" && "text-slate-300 hover:bg-[rgba(148,163,184,0.1)] hover:text-slate-50",
        className,
      )}
      {...props}
    />
  );
}
