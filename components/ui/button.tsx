import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
};

export function Button({ className, variant = "default", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        variant === "default" && "bg-zinc-900 text-white hover:bg-zinc-800",
        variant === "outline" && "border border-zinc-200 bg-white hover:bg-zinc-50",
        variant === "ghost" && "hover:bg-zinc-100",
        className,
      )}
      {...props}
    />
  );
}
