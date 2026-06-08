import { useState } from "react";
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

export function EmployeePicker({
  employees, value, onChange, placeholder = "Danışman seçin...",
  className, triggerClassName, disabled,
}: EmployeePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = value != null ? employees.find((e) => e.id === value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        <Command
          filter={(value, search) => {
            // value here is whatever we pass to CommandItem's `value` prop — we put name+kwuid
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Ara: ad veya KWUID..." className="h-9 text-xs" />
          <CommandList>
            <CommandEmpty>Sonuç yok.</CommandEmpty>
            <CommandGroup>
              {employees.map((e) => (
                <CommandItem
                  key={e.id}
                  value={`${e.name} ${e.kwuid ?? ""}`}
                  onSelect={() => {
                    onChange(e.id === value ? null : e.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5", value === e.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{e.name}</span>
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
