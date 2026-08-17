import { COUNTRY_CODES, DEFAULT_COUNTRY } from "./countryCodes";

// Türkiye (varsayılan): mevcut yerel format "05xxxxxxxxx" (11 hane, başında 0) — WhatsApp
// gönderimi, arama ve CSV/Sheets exportu bu formatı beklediği için AYNEN korunuyor.
// Diğer ülkeler: "+{ülke kodu}{ulusal numara}" (E.164).
export function isTurkeyDial(dial: string): boolean {
  return dial === "90";
}

export function composePhone(dial: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  if (isTurkeyDial(dial)) return digits;
  return digits ? `+${dial}${digits}` : "";
}

export function isValidPhoneForCountry(dial: string, national: string): boolean {
  const digits = national.replace(/\D/g, "");
  if (isTurkeyDial(dial)) return /^05\d{9}$/.test(digits);
  // Ülkeden ülkeye hane sayısı değişir (E.164: ülke kodu hariç tipik olarak 4-12 hane).
  return digits.length >= 4 && digits.length <= 12;
}

// Kayıtlı bir telefon değerinden ("05xxxxxxxxx" ya da "+{kod}...") ülke + inputta gösterilecek
// ulusal numarayı çıkarır. Boş/eşleşmeyen değerler Türkiye'ye düşer.
export function parseStoredPhone(stored: string | null | undefined): { dial: string; national: string } {
  const value = (stored ?? "").trim();
  if (!value.startsWith("+")) {
    return { dial: DEFAULT_COUNTRY.dial, national: value.replace(/\D/g, "") };
  }
  const digits = value.slice(1).replace(/\D/g, "");
  const byLongestCode = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);
  const match = byLongestCode.find((c) => digits.startsWith(c.dial));
  if (match) return { dial: match.dial, national: digits.slice(match.dial.length) };
  return { dial: DEFAULT_COUNTRY.dial, national: digits };
}
