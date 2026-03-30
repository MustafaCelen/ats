import { useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useApplications } from "@/hooks/use-applications";
import { format } from "date-fns";
import {
  DollarSign, Plus, CheckCircle2, XCircle, Trash2,
  Send, Clock, FileText, TrendingUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Offer, Candidate, Job } from "@shared/schema";

type OfferWithRelations = Offer & { candidate?: Candidate; job?: Job };

const OFFER_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; next?: string[] }> = {
  draft:            { label: "Draft",            color: "bg-gray-100 text-gray-700 border-gray-200",         icon: FileText,     next: ["pending_approval", "sent"] },
  pending_approval: { label: "Pending Approval", color: "bg-yellow-100 text-yellow-700 border-yellow-200",    icon: Clock,        next: ["approved", "rejected"] },
  approved:         { label: "Approved",         color: "bg-blue-100 text-blue-700 border-blue-200",         icon: CheckCircle2, next: ["sent"] },
  sent:             { label: "Sent",             color: "bg-purple-100 text-purple-700 border-purple-200",   icon: Send,         next: ["accepted", "rejected"] },
  accepted:         { label: "Accepted",         color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: TrendingUp,   next: [] },
  rejected:         { label: "Rejected",         color: "bg-red-100 text-red-700 border-red-200",            icon: XCircle,      next: [] },
};

const STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  sent: "Sent to Candidate",
  accepted: "Mark Accepted",
  rejected: "Mark Rejected",
};

function useOffers() {
  return useQuery<OfferWithRelations[]>({
    queryKey: ["/api/offers"],
  });
}

function useCreateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/offers", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/offers"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/reports"] });
    },
  });
}

function useUpdateOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/offers/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/offers"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/dashboard"] });
      qc.invalidateQueries({ queryKey: ["/api/stats/reports"] });
    },
  });
}

function useDeleteOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/offers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/offers"] }),
  });
}

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

export default function Offers() {
  const { data: offers, isLoading } = useOffers();
  const [filter, setFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { mutate: updateOffer } = useUpdateOffer();
  const { mutate: deleteOffer } = useDeleteOffer();
  const { toast } = useToast();

  const filtered = offers?.filter((o) => filter === "all" || o.status === filter) ?? [];

  const totalOffers = offers?.length ?? 0;
  const acceptedOffers = offers?.filter((o) => o.status === "accepted").length ?? 0;
  const pendingOffers = offers?.filter((o) => ["draft", "pending_approval", "approved", "sent"].includes(o.status)).length ?? 0;
  const totalValue = offers?.filter((o) => o.status === "accepted").reduce((s, o) => s + o.amount, 0) ?? 0;

  const handleStatusChange = (id: number, status: string) => {
    updateOffer({ id, status }, {
      onSuccess: () => toast({ title: `Offer ${OFFER_STATUS_CONFIG[status]?.label ?? status}` }),
    });
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold">Offers</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Track and manage candidate offers</p>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid="btn-create-offer">
            <Plus className="mr-1.5 h-4 w-4" /> Create Offer
          </Button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total Offers", value: totalOffers, color: "text-foreground" },
            { label: "Pending", value: pendingOffers, color: "text-amber-600" },
            { label: "Accepted", value: acceptedOffers, color: "text-emerald-600" },
            { label: "Total Value", value: `$${(totalValue / 1000).toFixed(0)}k`, color: "text-primary", isString: true },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
              <p className={`text-2xl font-display font-bold mt-0.5 ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap border-b border-border pb-3">
          {(["all", "draft", "pending_approval", "approved", "sent", "accepted", "rejected"] as const).map((f) => {
            const cfg = f === "all" ? null : OFFER_STATUS_CONFIG[f];
            const cnt = f === "all" ? offers?.length ?? 0 : offers?.filter((o) => o.status === f).length ?? 0;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                data-testid={`filter-offer-${f}`}
              >
                {cfg?.label ?? "All"} ({cnt})
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl bg-muted/30 animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No offers found</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
              Create your first offer
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((offer) => {
              const cfg = OFFER_STATUS_CONFIG[offer.status] ?? OFFER_STATUS_CONFIG.draft;
              const StatusIcon = cfg.icon;
              const nextStatuses = cfg.next ?? [];

              return (
                <div
                  key={offer.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all"
                  data-testid={`card-offer-${offer.id}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {cfg.label}
                        </span>
                      </div>
                      <h3 className="font-semibold text-foreground">
                        {offer.candidate?.name ?? "Unknown Candidate"}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {offer.job?.title ?? "Unknown Role"} · {offer.job?.department}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 font-semibold text-foreground text-sm">
                          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                          {formatCurrency(offer.amount, offer.currency)}
                        </span>
                        <span>{format(new Date(offer.createdAt!), "MMM d, yyyy")}</span>
                      </div>
                      {offer.notes && (
                        <p className="text-xs text-muted-foreground mt-1.5 italic">{offer.notes}</p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {nextStatuses.map((ns) => (
                        <Button
                          key={ns}
                          size="sm"
                          variant="outline"
                          className="text-xs h-8"
                          onClick={() => handleStatusChange(offer.id, ns)}
                          data-testid={`btn-offer-${ns}-${offer.id}`}
                        >
                          {STATUS_LABELS[ns] ?? ns}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600"
                        onClick={() => deleteOffer(offer.id, { onSuccess: () => toast({ title: "Offer deleted" }) })}
                        data-testid={`btn-delete-offer-${offer.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateOfferDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Layout>
  );
}

function CreateOfferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: applications } = useApplications();
  const { mutate, isPending } = useCreateOffer();
  const { toast } = useToast();

  const [form, setForm] = useState({
    applicationId: "",
    amount: "",
    currency: "USD",
    notes: "",
  });

  const selectedApp = applications?.find((a) => a.id === parseInt(form.applicationId));

  const handleSubmit = () => {
    if (!form.applicationId || !form.amount) {
      toast({ title: "Missing fields", description: "Please select an application and enter an amount.", variant: "destructive" });
      return;
    }
    if (!selectedApp) return;

    mutate({
      applicationId: parseInt(form.applicationId),
      jobId: selectedApp.jobId,
      candidateId: selectedApp.candidateId,
      amount: parseInt(form.amount),
      currency: form.currency,
      notes: form.notes || null,
      status: "draft",
    }, {
      onSuccess: () => {
        toast({ title: "Offer created!" });
        onOpenChange(false);
        setForm({ applicationId: "", amount: "", currency: "USD", notes: "" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" aria-describedby="create-offer-desc">
        <DialogHeader>
          <DialogTitle>Create Offer</DialogTitle>
          <p id="create-offer-desc" className="text-sm text-muted-foreground">
            Draft a compensation offer for a candidate.
          </p>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Application *</Label>
            <Select value={form.applicationId} onValueChange={(v) => setForm((f) => ({ ...f, applicationId: v }))}>
              <SelectTrigger data-testid="select-offer-application">
                <SelectValue placeholder="Select candidate application..." />
              </SelectTrigger>
              <SelectContent>
                {applications?.filter((a) => a.candidate?.name).map((a) => (
                  <SelectItem key={a.id} value={a.id.toString()}>
                    {a.candidate?.name} — {a.job?.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label className="text-xs font-medium mb-1.5 block">Amount *</Label>
              <Input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 120000"
                data-testid="input-offer-amount"
              />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Currency</Label>
              <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                <SelectTrigger data-testid="select-offer-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Includes equity, signing bonus..."
              rows={2}
              data-testid="input-offer-notes"
            />
          </div>

          <Button onClick={handleSubmit} disabled={isPending} className="w-full" data-testid="btn-submit-offer">
            {isPending ? "Creating..." : "Create Offer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
