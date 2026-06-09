import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type EmployeeOption = { id: number; name: string; kwuid?: string | null };

interface EmployeePickerProps {
  employees: EmployeeOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

// Normalize Turkish characters for matching: "Söngül" ≈ "songul", "İSTANBUL" ≈ "istanbul"
const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u");

export function EmployeePicker({
  employees, value, onChange, placeholder = "Danışman seçin...",
  className, triggerClassName, disabled,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = value != null ? employees.find((e) => e.id === value) : null;

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return employees;
    return employees.filter((e) => {
      const nameMatch = normalize(e.name).includes(q);
      const kwuidMatch = !!e.kwuid && normalize(String(e.kwuid)).includes(q);
      return nameMatch || kwuidMatch;
    });
  }, [employees, query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", triggerClassName)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-[--radix-popover-trigger-width]", className)} align="start">
        {/* shouldFilter=false → we do our own filtering above. Avoids cmdk's value-based
            dedup which hides employees with duplicate names. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Ara: ad veya KWUID..."
            className="h-9 text-xs"
          />
          <CommandList>
            <CommandEmpty>Sonuç yok.</CommandEmpty>
            <CommandGroup>
              {filtered.map((e) => (
                <CommandItem
                  key={e.id}
                  // Unique value per employee — prevents cmdk dedup collisions.
                  value={`emp-${e.id}`}
                  onSelect={() => {
                    onChange(e.id === value ? null : e.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="text-xs data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === e.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate flex-1">{e.name}</span>
                  {e.kwuid && <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{e.kwuid}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
