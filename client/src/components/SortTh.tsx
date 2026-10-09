import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSortable, type SortDir, type SortGetters, type SortState } from "@/lib/sort";

// Koşullu/iç içe render edilen tablolar için render-prop sarmalayıcı: hook'u kendi içinde
// tutar, böylece sayfa bileşeninde hook sırası bozulmadan her tabloya ayrı sıralama verilir.
// Anahtar tipi bilerek `string`: getters/initial anahtarlarından daraltma yapılmasın
// (getter verilmeyen sütunlar varsayılan olarak satırın aynı adlı alanından okunur).
export function SortableRows<T>({ rows, getters, initial, children }: {
  rows: readonly T[];
  getters?: Record<string, (row: T) => unknown>;
  initial?: SortState<string>;
  children: (s: { sorted: T[]; sort: SortState<string>; toggle: (key: string, firstDir?: SortDir) => void }) => ReactNode;
}) {
  const { sorted, sort, toggle } = useSortable<T, string>(rows, (getters ?? {}) as SortGetters<T, string>, initial);
  return <>{children({ sorted, sort, toggle })}</>;
}

// ── Sıralanabilir sütun başlığı ──────────────────────────────────────────────
// Hizalama kuralı: başlık, gövde hücresiyle aynı yöne hizalanır (metin sol,
// sayı/para sağ, rozet/durum orta). Başlıklar tek satır (nowrap).

export type Align = "left" | "right" | "center";
const alignCls: Record<Align, string> = { left: "text-left", right: "text-right", center: "text-center" };
const justifyCls: Record<Align, string> = { left: "justify-start", right: "justify-end", center: "justify-center" };

export function SortIcon({ active, dir, className }: { active: boolean; dir: SortDir; className?: string }) {
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return <Icon className={cn("h-3 w-3 shrink-0", active ? "opacity-90" : "opacity-30 group-hover:opacity-60", className)} aria-hidden />;
}

type SortThProps<K extends string> = {
  label: ReactNode;
  sortKey?: K;                 // yoksa sıralanamaz başlık
  sort: SortState<K>;
  onSort: (key: K, firstDir?: SortDir) => void;
  align?: Align;
  firstDir?: SortDir;          // ilk tıkta yön (sayılarda genelde "desc")
  className?: string;
  title?: string;
  colSpan?: number;
};

// <th> — <table> tabanlı listeler için.
export function SortTh<K extends string>({ label, sortKey, sort, onSort, align = "left", firstDir, className, title, colSpan }: SortThProps<K>) {
  const active = !!sortKey && sort.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined;
  return (
    <th
      scope="col"
      colSpan={colSpan}
      aria-sort={ariaSort}
      title={title}
      className={cn("whitespace-nowrap align-middle font-medium", alignCls[align], active && "text-foreground", className)}
    >
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey, firstDir)}
          className={cn("group inline-flex items-center gap-1 max-w-full select-none hover:text-foreground", justifyCls[align], align === "right" && "flex-row-reverse")}
        >
          <span className="truncate">{label}</span>
          <SortIcon active={active} dir={sort.dir} />
        </button>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </th>
  );
}

// <div> — grid (div tabanlı) listelerin başlık satırı için.
export function SortHead<K extends string>({ label, sortKey, sort, onSort, align = "left", firstDir, className, title }: Omit<SortThProps<K>, "colSpan">) {
  const active = !!sortKey && sort.key === sortKey;
  return (
    <div title={title} className={cn("min-w-0 whitespace-nowrap", alignCls[align], active && "text-foreground", className)}>
      {sortKey ? (
        <button
          type="button"
          onClick={() => onSort(sortKey, firstDir)}
          className={cn("group inline-flex items-center gap-1 max-w-full select-none hover:text-foreground uppercase tracking-wide", justifyCls[align], align === "right" && "flex-row-reverse")}
        >
          <span className="truncate">{label}</span>
          <SortIcon active={active} dir={sort.dir} />
        </button>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </div>
  );
}
