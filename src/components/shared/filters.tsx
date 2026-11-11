"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/shared/field";
import { cn } from "@/lib/utils";

export type FilterDef =
  | { type: "search"; name: string; placeholder?: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; allLabel?: string }
  | { type: "date"; name: string; label: string }
  | { type: "month"; name: string; label: string };

function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return React.useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in updates)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );
}

/** URL-driven filter bar: every filter is shareable, bookmarkable and server-rendered. */
export function FilterBar({ filters, className }: { filters: FilterDef[]; className?: string }) {
  const params = useSearchParams();
  const update = useUpdateParams();
  const active = filters.some((f) => params.get(f.name));

  return (
    <div className={cn("no-print flex flex-wrap items-end gap-2", className)}>
      {filters.map((f) => {
        if (f.type === "search") return <SearchBox key={f.name} name={f.name} placeholder={f.placeholder} />;
        if (f.type === "select")
          return (
            <label key={f.name} className="grid gap-1 text-xs font-medium text-muted-foreground">
              {f.label}
              <NativeSelect
                aria-label={f.label}
                value={params.get(f.name) ?? ""}
                onChange={(e) => update({ [f.name]: e.target.value })}
                className="h-8 min-w-36 text-foreground"
              >
                <option value="">{f.allLabel ?? "All"}</option>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </NativeSelect>
            </label>
          );
        return (
          <label key={f.name} className="grid gap-1 text-xs font-medium text-muted-foreground">
            {f.label}
            <Input
              type={f.type}
              aria-label={f.label}
              value={params.get(f.name) ?? ""}
              onChange={(e) => update({ [f.name]: e.target.value })}
              className="h-8 w-40 text-foreground"
            />
          </label>
        );
      })}
      {active && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update(Object.fromEntries(filters.map((f) => [f.name, null])))}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  );
}

function SearchBox({ name, placeholder }: { name: string; placeholder?: string }) {
  const params = useSearchParams();
  const update = useUpdateParams();
  const [value, setValue] = React.useState(params.get(name) ?? "");
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update({ [name]: value.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on value only
  }, [value]);

  return (
    <div className="relative min-w-56 flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        aria-label={placeholder ?? "Search"}
        className="h-8 pl-8"
      />
    </div>
  );
}

export function SortHeader({ column, label, className }: { column: string; label: string; className?: string }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const current = params.get("sort");
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const isActive = current === column;
  const next = new URLSearchParams(params.toString());
  next.set("sort", column);
  next.set("dir", isActive && dir === "desc" ? "asc" : "desc");
  next.delete("page");
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Link
      href={`${pathname}?${next.toString()}`}
      scroll={false}
      className={cn("inline-flex items-center gap-1 hover:text-foreground", isActive && "text-foreground", className)}
    >
      {label}
      <Icon className="size-3 opacity-60" />
    </Link>
  );
}

export function Pagination({ page, pageSize, total }: { page: number; pageSize: number; total: number }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const next = new URLSearchParams(params.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="no-print flex items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground">
      <span className="tabular">
        Showing {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" asChild={page > 1} disabled={page <= 1} aria-label="Previous page">
          {page > 1 ? <Link href={href(page - 1)} scroll={false}><ChevronLeft /></Link> : <ChevronLeft />}
        </Button>
        <span className="tabular px-2">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="icon-sm" asChild={page < pages} disabled={page >= pages} aria-label="Next page">
          {page < pages ? <Link href={href(page + 1)} scroll={false}><ChevronRight /></Link> : <ChevronRight />}
        </Button>
      </div>
    </div>
  );
}
