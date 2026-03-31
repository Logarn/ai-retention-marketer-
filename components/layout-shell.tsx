"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Brain, LayoutGrid, Megaphone, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/customers", label: "Customers", icon: Users2 },
  { href: "/segments", label: "Segments", icon: BarChart3 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/composer", label: "AI Composer", icon: Bot },
  { href: "/templates", label: "Templates", icon: LayoutGrid },
  { href: "/brain", label: "Brand Brain", icon: Brain },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 p-4 md:grid-cols-[250px_1fr] md:p-6">
        <aside className="sticky top-6 h-fit rounded-2xl border border-white/10 bg-gradient-to-b from-[#121a28]/95 to-[#0d131f]/95 p-4 shadow-[0_20px_70px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="mb-6 space-y-1 border-b border-white/10 pb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Retention Suite</p>
            <h1 className="text-lg font-semibold text-slate-100">Retention AI</h1>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[linear-gradient(135deg,rgba(255,123,66,0.22),rgba(245,158,11,0.2))] text-orange-100 ring-1 ring-orange-300/30"
                      : "text-slate-300 hover:bg-white/5 hover:text-slate-100",
                  )}
                >
                  <Icon size={16} className={active ? "text-orange-300" : "text-slate-400"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-xs text-slate-400">Focus</p>
            <p className="mt-1 text-sm font-medium text-slate-200">Reduce churn, grow repeat revenue.</p>
          </div>
        </aside>
        <main className="space-y-6 pb-8">{children}</main>
      </div>
    </div>
  );
}
