"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  ClipboardList,
  FileText,
  Gauge,
  Mic2,
  ShieldCheck,
  ShoppingBag,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const brainNavItems = [
  { href: "/brain", label: "Overview", icon: Gauge },
  { href: "/brain/profile", label: "Brand Profile", icon: Brain },
  { href: "/brain/voice", label: "Voice & Tone", icon: Mic2 },
  { href: "/brain/rules", label: "Do's & Don'ts", icon: ClipboardList },
  { href: "/brain/products", label: "Products", icon: ShoppingBag },
  { href: "/brain/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/brain/competitors", label: "Competitors", icon: Users },
  { href: "/brain/documents", label: "Documents", icon: FileText },
];

export function BrainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen">
      <div className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 p-4 md:grid-cols-[250px_1fr] md:p-6">
        <aside className="sticky top-6 h-fit rounded-2xl border border-white/10 bg-gradient-to-b from-[#121a28]/95 to-[#0d131f]/95 p-4 shadow-[0_20px_70px_rgba(2,6,23,0.55)] backdrop-blur-xl">
          <div className="mb-6 space-y-1 border-b border-white/10 pb-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              Sauti Intelligence
            </p>
            <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <Brain size={18} className="text-indigo-300" />
              Brand Brain
            </h1>
          </div>
          <nav className="space-y-1">
            {brainNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[linear-gradient(135deg,rgba(120,119,255,0.23),rgba(99,102,241,0.2))] text-indigo-100 ring-1 ring-indigo-300/30"
                      : "text-slate-300 hover:bg-white/5 hover:text-slate-100",
                  )}
                >
                  <Icon size={16} className={active ? "text-indigo-300" : "text-slate-400"} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-xs text-slate-400">Comprehension</p>
            <p className="mt-1 text-sm font-medium text-slate-200">
              Learn your brand, then scale winning messages.
            </p>
          </div>
        </aside>
        <main className="space-y-6 pb-8">{children}</main>
      </div>
    </div>
  );
}
