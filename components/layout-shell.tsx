"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bot, Cog, LayoutGrid, Megaphone, Users2 } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/customers", label: "Customers", icon: Users2 },
  { href: "/segments", label: "Segments", icon: BarChart3 },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/composer", label: "AI Composer", icon: Bot },
  { href: "/templates", label: "Templates", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Cog },
];

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 p-4 md:grid-cols-[240px_1fr] md:p-6">
        <aside className="rounded-xl border border-slate-200 bg-white p-4">
          <h1 className="mb-6 text-lg font-semibold text-slate-900">Retention AI</h1>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
