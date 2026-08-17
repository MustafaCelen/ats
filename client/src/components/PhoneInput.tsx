import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_CODES, DEFAULT_COUNTRY } from "@/lib/countryCodes";

export function PhoneInput({
  countryIso2, national, onCountryChange, onNationalChange, testId,
}: {
  countryIso2: string;
  national: string;
  onCountryChange: (iso2: string) => void;
  onNationalChange: (national: string) => void;
  testId?: string;
}) {
  const country = COUNTRY_CODES.find((c) => c.iso2 === countryIso2) ?? DEFAULT_COUNTRY;
  return (
    <div className="flex gap-2">
      <Select value={country.iso2} onValueChange={onCountryChange}>
        <SelectTrigger className="w-[92px] shrink-0 px-2" data-testid={testId ? `${testId}-country` : undefined}>
          <SelectValue>{country.flag} +{country.dial}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRY_CODES.map((c) => (
            <SelectItem key={c.iso2} value={c.iso2}>
              {c.flag} {c.name} (+{c.dial})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={national}
        onChange={(e) => onNationalChange(e.target.value)}
        placeholder={country.dial === "90" ? "05xxxxxxxxx" : "5xx xxx xx xx"}
        data-testid={testId}
      />
    </div>
  );
}
