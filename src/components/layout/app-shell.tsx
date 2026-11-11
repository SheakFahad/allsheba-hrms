"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { KeyRound, LogOut, Menu, Moon, Sun, ChevronDown } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { signOut } from "@/app/(auth)/actions";
import { NAV } from "./nav-config";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/types";

interface ShellProps {
  role: AppRole;
  user: { fullName: string; username: string };
  company: { name: string; logoUrl: string };
  badges?: Record<string, number>;
  children: React.ReactNode;
}

function SidebarNav({ role, badges, onNavigate }: { role: AppRole; badges?: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-5 px-3 py-4" aria-label="Main navigation">
      {NAV[role].map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{group.label}</p>
          <ul className="grid gap-0.5">
            {group.items.map((item) => {
              const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              const count = badges?.[item.href];
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium text-sidebar-foreground/80 transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {!!count && (
                      <span className="tabular rounded-full bg-warning-soft px-1.5 text-[11px] font-semibold text-warning">{count}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ company, role }: { company: ShellProps["company"]; role: AppRole }) {
  return (
    <Link href={role === "admin" ? "/admin" : "/entry"} className="flex items-center gap-2.5 px-5 py-4">
      <Logo src={company.logoUrl} variant="mark" className="h-8" alt={company.name} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{company.name}</span>
        <span className="block text-[11px] font-medium text-muted-foreground">
          {role === "admin" ? "Admin Panel" : "Entry Panel"}
        </span>
      </span>
    </Link>
  );
}

export function AppShell({ role, user, company, badges, children }: ShellProps) {
  const [open, setOpen] = React.useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r bg-sidebar lg:flex">
        <Brand company={company} role={role} />
        <div className="flex-1 overflow-y-auto">
          <SidebarNav role={role} badges={badges} />
        </div>
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Brand company={company} role={role} />
          <div className="overflow-y-auto">
            <SidebarNav role={role} badges={badges} onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <div className="flex items-center gap-2 lg:hidden">
            <Logo src={company.logoUrl} variant="mark" className="h-7" alt={company.name} />
          </div>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle dark mode"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden dark:block" />
            <Moon className="dark:hidden" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-1.5">
                <EmployeeAvatar name={user.fullName} className="size-7" />
                <span className="hidden text-left sm:block">
                  <span className="block text-xs font-semibold leading-tight">{user.fullName}</span>
                  <span className="block text-[11px] leading-tight text-muted-foreground capitalize">{role}</span>
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <span className="block text-sm">{user.fullName}</span>
                <span className="block text-xs font-normal text-muted-foreground">@{user.username}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/change-password"><KeyRound /> Change password</Link>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
