import { useMemo, useState } from "react";

// ── Ortak liste sıralama ──────────────────────────────────────────────────────
// Tüm liste/tablo görünümleri sütun başlığına tıklayarak sıralanır:
//   1. tık → artan, 2. tık → azalan, 3. tık → varsayılan sıra.
// Karşılaştırma: boş değerler her zaman sonda; sayı sayısal, tarih kronolojik,
// metin Türkçe harf sırası (localeCompare "tr").

export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { key: K | null; dir: SortDir };

const collator = new Intl.Collator("tr", { sensitivity: "base", numeric: true });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));
}

// Genel karşılaştırıcı: türü değerden anlar.
export function compareValues(a: unknown, b: unknown): number {
  const ea = isEmpty(a), eb = isEmpty(b);
  if (ea && eb) return 0;
  if (ea) return 1;   // boşlar sona
  if (eb) return -1;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a), sb = String(b);
  // "12.500,00" / "12500" gibi sayısal metinler
  const na = Number(sa.replace(/\./g, "").replace(",", "."));
  const nb = Number(sb.replace(/\./g, "").replace(",", "."));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && /^[\d.,\s-]+$/.test(sa) && /^[\d.,\s-]+$/.test(sb)) return na - nb;
  if (ISO_DATE.test(sa) && ISO_DATE.test(sb)) return sa.localeCompare(sb);
  return collator.compare(sa, sb);
}

export type SortGetters<T, K extends string> = Partial<Record<K, (row: T) => unknown>>;

export function sortRows<T, K extends string>(
  rows: readonly T[],
  state: SortState<K>,
  getters: SortGetters<T, K>,
): T[] {
  if (!state.key) return rows as T[];
  const get = getters[state.key] ?? ((r: T) => (r as any)[state.key as string]);
  const sign = state.dir === "asc" ? 1 : -1;
  // Kararlı sıralama: eşit değerlerde orijinal sıra korunur.
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      const c = compareValues(x.v, y.v);
      // Boşlar yönden bağımsız sonda kalsın.
      if (isEmpty(x.v) !== isEmpty(y.v)) return c;
      return c !== 0 ? c * sign : x.i - y.i;
    })
    .map((x) => x.row);
}

export function nextSortState<K extends string>(cur: SortState<K>, key: K, firstDir: SortDir = "asc"): SortState<K> {
  if (cur.key !== key) return { key, dir: firstDir };
  if (cur.dir === firstDir) return { key, dir: firstDir === "asc" ? "desc" : "asc" };
  return { key: null, dir: firstDir };
}

export function useSortable<T, K extends string>(
  rows: readonly T[],
  getters: SortGetters<T, K> = {},
  initial: SortState<K> = { key: null, dir: "asc" },
) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const sorted = useMemo(() => sortRows(rows, sort, getters), [rows, sort, getters]);
  const toggle = (key: K, firstDir: SortDir = "asc") => setSort((s) => nextSortState(s, key, firstDir));
  return { sorted, sort, toggle, setSort };
}
