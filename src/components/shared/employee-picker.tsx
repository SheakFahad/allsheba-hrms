"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmployeeAvatar } from "@/components/shared/employee-avatar";
import { cn } from "@/lib/utils";

export interface PickerEmployee {
  id: string;
  code: string;
  name: string;
  department: string | null;
  designation?: string | null;
  photoUrl?: string | null;
}

/** Searchable employee combobox — matches by name or Employee ID. */
export function EmployeePicker({
  employees,
  value,
  onChange,
  placeholder = "Search employee by name or ID…",
  id,
  invalid,
  className,
  disabled,
  renderMeta,
}: {
  employees: PickerEmployee[];
  value: string | null;
  onChange: (id: string) => void;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  className?: string;
  disabled?: boolean;
  renderMeta?: (e: PickerEmployee) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = employees.find((e) => e.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("h-11 w-full justify-between bg-card px-3 font-normal", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <EmployeeAvatar name={selected.name} photoUrl={selected.photoUrl} className="size-7" />
              <span className="truncate font-medium">{selected.name}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{selected.code}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder="Type a name or Employee ID…" />
          <CommandList>
            <CommandEmpty>No employee found.</CommandEmpty>
            <CommandGroup>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.code} ${e.department ?? ""}`}
                  onSelect={() => {
                    onChange(e.id);
                    setOpen(false);
                  }}
                  className="gap-2.5"
                >
                  <EmployeeAvatar name={e.name} photoUrl={e.photoUrl} className="size-7" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.code}
                      {e.department ? ` · ${e.department}` : ""}
                    </span>
                  </span>
                  {renderMeta?.(e)}
                  <Check className={cn("size-4", value === e.id ? "opacity-100" : "opacity-0")} />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
