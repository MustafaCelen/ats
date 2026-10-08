import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { EmployeePicker } from "@/components/EmployeePicker";

// Adayı yönlendiren danışman (ÜK 45+45 "Katkı Payı Yönlendirme" buradan sayılır).
// Serbest metin "Referans" alanı dış kaynaklar için ayrıca kalır.
export function ReferralAdvisorField({
  value, onChange,
}: {
  value: number | null;
  onChange: (id: number | null, name: string | null) => void;
}) {
  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ["/api/employees"],
    queryFn: () => fetch("/api/employees", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const options = employees
    .filter((e) => e.status === "active" || e.id === value)
    .map((e) => ({ id: e.id, name: e.candidate?.name ?? `Çalışan #${e.id}`, kwuid: e.kwuid }));

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1">
        <EmployeePicker
          employees={options}
          value={value}
          placeholder="Danışman seçin (varsa)…"
          onChange={(id) => onChange(id, options.find((o) => o.id === id)?.name ?? null)}
        />
      </div>
      {value != null && (
        <button
          type="button"
          onClick={() => onChange(null, null)}
          className="h-9 w-9 shrink-0 rounded-md border border-input flex items-center justify-center text-muted-foreground hover:text-foreground"
          title="Referans danışmanı kaldır"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
