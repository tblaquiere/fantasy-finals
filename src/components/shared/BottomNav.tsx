"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Draft/Game", icon: "🏀" },
  { href: "/standings", label: "Standings", icon: "📊" },
  { href: "/league", label: "League", icon: "👥" },
] as const;

interface BottomNavProps {
  isAdmin?: boolean;
}

export function BottomNav({ isAdmin = false }: BottomNavProps) {
  const pathname = usePathname();

  const items = isAdmin
    ? [...navItems, { href: "/admin", label: "Admin", icon: "⚙️" } as const]
    : navItems;

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 h-16 border-t border-zinc-800 bg-zinc-900"
    >
      <ul className="flex h-full items-stretch">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? "text-orange-500" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
