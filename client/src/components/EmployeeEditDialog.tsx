import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  CONTRACT_TYPES, URETKENLIK_ORANLAR, TURKEY_CITIES, CANDIDATE_CATEGORIES,
  type PublicUser,
} from "@shared/schema";
import { useUpdateEmployee } from "@/hooks/use-employees";
import { useUpdateCandidate } from "@/hooks/use-candidates";
import { useToast } from "@/hooks/use-toast";

const MONTHS_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
const SPECIALIZATIONS = ["Konut", "Ticari", "Arsa", "Lüks", "Yatırım", "Kiralık"];
const LANGUAGES = ["Türkçe", "İngilizce", "Arapça", "Rusça", "Almanca", "Fransızca"];

const CATEGORY_META: Record<string, { label: string; desc: string; color: string }> = {
  K0: { label: "K0", desc: "Sektöre Yeni",          color: "bg-slate-100 text-slate-700 ring-slate-300" },
  K1: { label: "K1", desc: "Lisanslı — Sınırlı",    color: "bg-amber-100 text-amber-800 ring-amber-300" },
  K2: { label: "K2", desc: "Üretken Danışman",       color: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
};

// ── Local helpers (not exported — live only in this file) ─────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border pb-1 mb-3">
      {label}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ChipToggle({
  options, value, onChange,
}: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) =>
    value.includes(opt) ? onChange(value.filter((x) => x !== opt)) : onChange([...value, opt]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            value.includes(opt)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground border-border hover:border-primary"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  emp: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function EmployeeEditDialog({ emp, open, onOpenChange }: Props) {
  const { mutate: updateEmployee, isPending: savingEmp } = useUpdateEmployee();
  const { mutate: updateCandidate, isPending: savingCand } = useUpdateCandidate();
  const isPending = savingEmp || savingCand;
  const { toast } = useToast();

  const { data: hiringManagers = [] } = useQuery<PublicUser[]>({
    queryKey: ["/api/hiring-managers"],
    queryFn: () => fetch("/api/hiring-managers").then((r) => r.json()),
  });

  const c = emp.candidate ?? {};

  // ── 1. Kişisel Bilgiler ──
  const [name, setName] = useState<string>(c.name ?? "");
  const [email, setEmail] = useState<string>(c.email ?? "");
  const [phone, setPhone] = useState<string>(c.phone ?? "");
  const [socialMedia, setSocialMedia] = useState<string>(c.socialMedia ?? "");

  // ── 2. Konum ──
  const [office, setOffice] = useState<string>(c.office ?? "");
  const [city, setCity] = useState<string>(c.city ?? "");
  const [district, setDistrict] = useState<string>(c.district ?? "");
  const [address, setAddress] = useState<string>(c.address ?? "");

  // ── 3. Acil Durum ──
  const [emergencyName, setEmergencyName] = useState<string>(c.emergencyContactName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState<string>(c.emergencyContactPhone ?? "");

  // ── 4. Gayrimenkul Profili ──
  const [category, setCategory] = useState<string>(c.category ?? "K0");
  const [licenseStatus, setLicenseStatus] = useState<string>(c.licenseStatus ?? "unlicensed");
  const [licenseNumber, setLicenseNumber] = useState<string>(c.licenseNumber ?? "");
  const [experience, setExperience] = useState<string>(String(c.experience ?? 0));
  const [specialization, setSpecialization] = useState<string[]>(c.specialization ?? []);
  const [languages, setLanguages] = useState<string[]>(c.languages ?? []);

  // ── 5. KW Bilgileri ──
  const [kwuid, setKwuid] = useState<string>(emp.kwuid ?? "");
  const [kwMail, setKwMail] = useState<string>(emp.kwMail ?? "");
  const [title, setTitle] = useState<string>(emp.title ?? "");
  const [startDate, setStartDate] = useState<string>(
    emp.startDate ? new Date(emp.startDate).toISOString().split("T")[0] : ""
  );
  const [contractType, setContractType] = useState<string>(emp.contractType ?? "");
  const [capMonth, setCapMonth] = useState<string>(() => {
    if (emp.capMonth) return emp.capMonth;
    if (emp.startDate) {
      const d = new Date(emp.startDate);
      d.setMonth(d.getMonth() + 1);
      return MONTHS_TR[d.getMonth()] ?? "";
    }
    return "";
  });
  const [capValue, setCapValue] = useState<string>(emp.capValue ?? "");

  // ── 6. Koçluk ──
  const [coachingType, setCoachingType] = useState<"none" | "uk" | "dua">(() => {
    if (emp.uretkenlikKoclugu) return "uk";
    if ((emp as any).dua) return "dua";
    return "none";
  });
  const [coachId, setCoachId] = useState<string>(() => {
    if (!emp.uretkenlikKoclugu) return "";
    return emp.uretkenlikKocluguManagerId ? String(emp.uretkenlikKocluguManagerId) : "";
  });
  const [duaCoachId, setDuaCoachId] = useState<string>(() => {
    if (!(emp as any).dua) return "";
    return (emp as any).duaManagerId ? String((emp as any).duaManagerId) : "";
  });
  const [coachRate, setCoachRate] = useState<string>(() => {
    const raw = emp.uretkenlikKocluguOran ?? "";
    if (!raw) return "";
    if ((URETKENLIK_ORANLAR as readonly string[]).includes(raw)) return raw;
    const digits = raw.replace(/[^0-9]/g, "");
    const candidate = `${digits}%`;
    if ((URETKENLIK_ORANLAR as readonly string[]).includes(candidate)) return candidate;
    return raw;
  });
  const [ukEndDate, setUkEndDate] = useState<string>((emp as any).ukEndDate ?? "");

  // ── 7. Fatura & Vergi ──
  const [billingName, setBillingName] = useState<string>(emp.billingName ?? "");
  const [billingAddress, setBillingAddress] = useState<string>(emp.billingAddress ?? "");
  const [billingDistrict, setBillingDistrict] = useState<string>(emp.billingDistrict ?? "");
  const [billingCity, setBillingCity] = useState<string>(emp.billingCity ?? "");
  const [billingCountry, setBillingCountry] = useState<string>(emp.billingCountry ?? "Türkiye");
  const [taxOffice, setTaxOffice] = useState<string>(emp.taxOffice ?? "");
  const [taxId, setTaxId] = useState<string>(emp.taxId ?? "");
  const [birthDate, setBirthDate] = useState<string>(emp.birthDate ?? "");

  // ── 8. Diğer ──
  const [referredBy, setReferredBy] = useState<string>(c.referredBy ?? "");
  const [resumeText, setResumeText] = useState<string>(c.resumeText ?? "");

  const handleSave = () => {
    if (!name.trim()) {
      toast({ title: "Ad zorunludur", variant: "destructive" });
      return;
    }
    if (phone && !/^05\d{9}$/.test(phone)) {
      toast({ title: "Geçersiz telefon", description: "05xxxxxxxxx formatında giriniz (11 haneli)", variant: "destructive" });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Geçersiz e-posta adresi", variant: "destructive" });
      return;
    }
    if (kwMail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kwMail)) {
      toast({ title: "Geçersiz KW e-posta adresi", variant: "destructive" });
      return;
    }
    const expNum = parseInt(experience);
    if (isNaN(expNum) || expNum < 0) {
      toast({ title: "Deneyim geçerli bir sayı olmalıdır (0 veya üzeri)", variant: "destructive" });
      return;
    }
    if (coachingType === "uk" && !coachId) {
      toast({ title: "Koç seçilmedi", description: "ÜK koçluğu için bir koç seçmelisiniz", variant: "destructive" });
      return;
    }
    if (coachingType === "dua" && !duaCoachId) {
      toast({ title: "Koç seçilmedi", description: "DUA koçluğu için bir koç seçmelisiniz", variant: "destructive" });
      return;
    }
    if (coachingType === "uk" && !coachRate) {
      toast({ title: "Paylaşım oranı seçilmedi", description: "ÜK koçluğu için oran belirtmelisiniz", variant: "destructive" });
      return;
    }
    if (taxId && !/^\d{10,11}$/.test(taxId)) {
      toast({ title: "Geçersiz Vergi/TC No", description: "10 haneli vergi numarası veya 11 haneli TC kimlik numarası giriniz", variant: "destructive" });
      return;
    }

    updateCandidate(
      {
        id: c.id,
        data: {
          name,
          email: email || undefined,
          phone: phone || undefined,
          socialMedia: socialMedia || undefined,
          office: office || undefined,
          city: city || undefined,
          district: district || undefined,
          address: address || undefined,
          emergencyContactName: emergencyName || undefined,
          emergencyContactPhone: emergencyPhone || undefined,
          category,
          licenseStatus,
          licenseNumber: licenseNumber || undefined,
          experience: parseInt(experience) || 0,
          specialization,
          languages,
          referredBy: referredBy || undefined,
          resumeText: resumeText || undefined,
        },
      },
      {
        onSuccess: () => {
          updateEmployee(
            {
              id: emp.id,
              kwuid: kwuid || undefined,
              kwMail: kwMail || undefined,
              title: title || undefined,
              startDate: startDate || undefined,
              contractType: contractType || null,
              capMonth: capMonth || undefined,
              capValue: capValue || undefined,
              uretkenlikKoclugu: coachingType === "uk",
              uretkenlikKocluguManagerId: coachingType === "uk" && coachId ? Number(coachId) : null,
              uretkenlikKocluguOran: coachingType === "uk" && coachRate ? coachRate : null,
              ukEndDate: coachingType === "uk" && ukEndDate ? ukEndDate : null,
              dua: coachingType === "dua",
              duaManagerId: coachingType === "dua" && duaCoachId ? Number(duaCoachId) : null,
              billingName: billingName || undefined,
              billingAddress: billingAddress || undefined,
              billingDistrict: billingDistrict || undefined,
              billingCity: billingCity || undefined,
              billingCountry: billingCountry || undefined,
              taxOffice: taxOffice || undefined,
              taxId: taxId || undefined,
              birthDate: birthDate || undefined,
            },
            {
              onSuccess: () => {
                toast({ title: "Profil güncellendi" });
                onOpenChange(false);
              },
              onError: () => toast({ title: "Güncelleme başarısız", variant: "destructive" }),
            }
          );
        },
        onError: () => toast({ title: "Güncelleme başarısız", variant: "destructive" }),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="emp-edit-unified-desc">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" /> Profili Düzenle
          </DialogTitle>
          <p id="emp-edit-unified-desc" className="text-sm text-muted-foreground">{c.name}</p>
        </DialogHeader>

        <div className="space-y-5 pt-1 pr-1">

          {/* ── 1. Kişisel Bilgiler ── */}
          <section>
            <SectionHeader label="Kişisel Bilgiler" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad Soyad *">
                <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-emp-cand-name" />
              </Field>
              <Field label="E-posta">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Telefon">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xxxxxxxxx" />
              </Field>
              <Field label="Sosyal Medya / LinkedIn">
                <Input value={socialMedia} onChange={(e) => setSocialMedia(e.target.value)} placeholder="https://linkedin.com/in/..." />
              </Field>
            </div>
          </section>

          {/* ── 2. Konum ── */}
          <section>
            <SectionHeader label="Konum" />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="KW Ofis">
                  <Select value={office} onValueChange={setOffice}>
                    <SelectTrigger><SelectValue placeholder="Ofis seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Akatlar">Akatlar</SelectItem>
                      <SelectItem value="Zekeriyaköy">Zekeriyaköy</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="Şehir">
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger><SelectValue placeholder="Şehir seçin..." /></SelectTrigger>
                  <SelectContent>
                    {TURKEY_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="İlçe">
                <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Kadıköy, Çankaya..." />
              </Field>
              <div className="col-span-2">
                <Field label="Açık Adres">
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Sokak, bina no, daire..." />
                </Field>
              </div>
            </div>
          </section>

          {/* ── 3. Acil Durum İletişim ── */}
          <section>
            <SectionHeader label="Acil Durum İletişim" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ad Soyad">
                <Input value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} placeholder="Yakın kişinin adı" />
              </Field>
              <Field label="Telefon">
                <Input value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+90..." />
              </Field>
            </div>
          </section>

          {/* ── 4. Gayrimenkul Profili ── */}
          <section>
            <SectionHeader label="Gayrimenkul Profili" />
            <div className="grid grid-cols-3 gap-2 mb-4">
              {CANDIDATE_CATEGORIES.map((cat) => {
                const m = CATEGORY_META[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      category === cat ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    <p className={`text-sm font-bold ${m?.color.split(" ")[1] ?? ""}`}>{m?.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{m?.desc}</p>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lisans Durumu">
                <Select value={licenseStatus} onValueChange={setLicenseStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlicensed">Lisanssız</SelectItem>
                    <SelectItem value="pending">Lisans Bekliyor</SelectItem>
                    <SelectItem value="licensed">Lisanslı</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Lisans No">
                <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} placeholder="TKGM-..." />
              </Field>
              <Field label="Deneyim (yıl)">
                <Input type="number" min={0} value={experience} onChange={(e) => setExperience(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4">
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Uzmanlık Alanları</p>
                <ChipToggle options={SPECIALIZATIONS} value={specialization} onChange={setSpecialization} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Yabancı Dil</p>
                <ChipToggle options={LANGUAGES} value={languages} onChange={setLanguages} />
              </div>
            </div>
          </section>

          {/* ── 5. KW Bilgileri ── */}
          <section>
            <SectionHeader label="KW Bilgileri" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="KWUID">
                <Input value={kwuid} onChange={(e) => setKwuid(e.target.value)} placeholder="KWUID girin" data-testid="input-kwuid" />
              </Field>
              <Field label="KW E-posta">
                <Input type="email" value={kwMail} onChange={(e) => setKwMail(e.target.value)} placeholder="isim@kw.com.tr" data-testid="input-kwmail" />
              </Field>
              <Field label="Ünvan">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Danışman" data-testid="input-emp-title" />
              </Field>
              <Field label="Başlangıç Tarihi">
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-startdate" />
              </Field>
              <Field label="Sözleşme Türü">
                <Select value={contractType} onValueChange={setContractType}>
                  <SelectTrigger data-testid="select-contract-type"><SelectValue placeholder="Seçiniz..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seçilmedi —</SelectItem>
                    {CONTRACT_TYPES.map((ct) => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cap Ayı">
                <Select value={capMonth} onValueChange={setCapMonth}>
                  <SelectTrigger data-testid="select-cap-month"><SelectValue placeholder="Ay seçin..." /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_TR.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Cap Değeri">
                <Input value={capValue} onChange={(e) => setCapValue(e.target.value)} placeholder="Cap miktarı" data-testid="input-cap-value" />
              </Field>
            </div>
          </section>

          {/* ── 6. Koçluk ── */}
          <section>
            <SectionHeader label="Koçluk" />
            <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
                {([["none", "Yok"], ["uk", "ÜK"], ["dua", "DÜA"]] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCoachingType(val)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      coachingType === val
                        ? val === "uk"
                          ? "bg-emerald-600 text-white shadow-sm"
                          : val === "dua"
                          ? "bg-violet-600 text-white shadow-sm"
                          : "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {coachingType === "uk" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ÜK Koçu">
                    <Select value={coachId} onValueChange={setCoachId}>
                      <SelectTrigger data-testid="select-uretkenlik-manager">
                        <SelectValue placeholder="Koç seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {hiringManagers.map((hm) => (
                          <SelectItem key={hm.id} value={String(hm.id)}>{hm.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Paylaşım Oranı">
                    <Select value={coachRate} onValueChange={setCoachRate}>
                      <SelectTrigger data-testid="select-uretkenlik-oran">
                        <SelectValue placeholder="Oran seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {URETKENLIK_ORANLAR.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="ÜK Çıkış Tarihi">
                    <Input type="date" value={ukEndDate} onChange={(e) => setUkEndDate(e.target.value)} placeholder="Mezuniyet / çıkış tarihi" />
                  </Field>
                </div>
              )}
              {coachingType === "dua" && (
                <div className="grid grid-cols-1 gap-3">
                  <Field label="DUA Koçu">
                    <Select value={duaCoachId} onValueChange={setDuaCoachId}>
                      <SelectTrigger data-testid="select-dua-manager">
                        <SelectValue placeholder="Koç seçin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {hiringManagers.map((hm) => (
                          <SelectItem key={hm.id} value={String(hm.id)}>{hm.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
            </div>
          </section>

          {/* ── 7. Fatura & Vergi Bilgileri ── */}
          <section>
            <SectionHeader label="Fatura & Vergi Bilgileri" />
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Şirket / Şahıs İsmi">
                  <Input value={billingName} onChange={(e) => setBillingName(e.target.value)} placeholder="Fatura kesilecek isim veya şirket" />
                </Field>
              </div>
              <div className="col-span-2">
                <Field label="Fatura Adresi">
                  <Input value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} placeholder="Sokak, bina no, daire..." />
                </Field>
              </div>
              <Field label="İlçe">
                <Input value={billingDistrict} onChange={(e) => setBillingDistrict(e.target.value)} placeholder="Kadıköy..." />
              </Field>
              <Field label="İl">
                <Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} placeholder="İstanbul..." />
              </Field>
              <Field label="Ülke">
                <Input value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} placeholder="Türkiye" />
              </Field>
              <Field label="Doğum Tarihi">
                <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </Field>
              <Field label="Vergi Dairesi">
                <Input value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} placeholder="Bağcılar VD..." />
              </Field>
              <Field label="Vergi / TCK No">
                <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="1234567890" />
              </Field>
            </div>
          </section>

          {/* ── 8. Diğer ── */}
          <section>
            <SectionHeader label="Diğer" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Referans (kim tanıttı?)">
                <Input value={referredBy} onChange={(e) => setReferredBy(e.target.value)} placeholder="Ad Soyad veya kaynak" />
              </Field>
              <div className="col-span-2">
                <Field label="Notlar / Özet">
                  <Textarea value={resumeText} onChange={(e) => setResumeText(e.target.value)} rows={3} placeholder="Ek bilgiler..." />
                </Field>
              </div>
            </div>
          </section>

          <div className="flex gap-2 pt-2 pb-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => onOpenChange(false)}>
              İptal
            </Button>
            <Button size="sm" className="flex-1" onClick={handleSave} disabled={isPending} data-testid="btn-save-employee">
              {isPending ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
