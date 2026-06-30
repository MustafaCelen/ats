import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Users2, Plus, Trash2, Pencil, Check, X, UserMinus, UserPlus } from "lucide-react";

interface TeamWithMembers {
  id: number;
  name: string;
  createdAt: string;
  memberIds: number[];
}

interface EmpRow {
  id: number;
  name: string;
  kwuid: string | null;
  status: string;
  category: string | null;
}

export default function Teams() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [newTeamName, setNewTeamName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [addSearch, setAddSearch] = useState("");

  const { data: teams = [], isLoading } = useQuery<TeamWithMembers[]>({
    queryKey: ["/api/teams"],
    queryFn: () => fetch("/api/teams", { credentials: "include" }).then(r => r.json()),
  });

  const { data: allEmployees = [] } = useQuery<EmpRow[]>({
    queryKey: ["/api/employees"],
    queryFn: async () => {
      const res = await fetch("/api/employees", { credentials: "include" });
      const data = await res.json();
      return data.map((e: any) => ({
        id: e.id,
        name: e.candidate?.name ?? `#${e.id}`,
        kwuid: e.kwuid ?? null,
        status: e.status,
        category: e.candidate?.category ?? null,
      }));
    },
    staleTime: 60_000,
  });

  const createTeam = useMutation({
    mutationFn: (name: string) =>
      fetch("/api/teams", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(async r => { if (!r.ok) throw await r.json(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      setNewTeamName("");
      toast({ title: "Takım oluşturuldu" });
    },
    onError: (e: any) => toast({ title: e.message ?? "Hata", variant: "destructive" }),
  });

  const renameTeam = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      fetch(`/api/teams/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then(async r => { if (!r.ok) throw await r.json(); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      setEditingId(null);
      toast({ title: "Takım adı güncellendi" });
    },
    onError: (e: any) => toast({ title: e.message ?? "Hata", variant: "destructive" }),
  });

  const deleteTeam = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/teams/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["/api/teams"] });
      if (selectedTeamId === id) setSelectedTeamId(null);
      toast({ title: "Takım silindi" });
    },
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const addMember = useMutation({
    mutationFn: ({ teamId, employeeId }: { teamId: number; employeeId: number }) =>
      fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/teams"] }),
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const removeMember = useMutation({
    mutationFn: ({ teamId, employeeId }: { teamId: number; employeeId: number }) =>
      fetch(`/api/teams/${teamId}/members/${employeeId}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/teams"] }),
    onError: () => toast({ title: "Hata", variant: "destructive" }),
  });

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const activeEmployees = allEmployees.filter(e => e.status === "active");
  const memberIds = new Set(selectedTeam?.memberIds ?? []);

  const teamMembers = activeEmployees.filter(e => memberIds.has(e.id));
  const nonMembersFiltered = activeEmployees.filter(e =>
    !memberIds.has(e.id) &&
    (addSearch === "" || e.name.toLowerCase().includes(addSearch.toLowerCase()) ||
     (e.kwuid ?? "").toLowerCase().includes(addSearch.toLowerCase()))
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Users2 className="h-6 w-6 text-primary" /> Takımlar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Danışmanları takımlara atayın ve raporlarda takım bazlı filtreleyin
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: team list ── */}
          <div className="space-y-4">
            {/* Create */}
            <div className="rounded-xl border border-border bg-card shadow-sm p-4 space-y-3">
              <h2 className="text-sm font-semibold">Yeni Takım</h2>
              <div className="flex gap-2">
                <Input
                  value={newTeamName}
                  onChange={e => setNewTeamName(e.target.value)}
                  placeholder="Takım adı…"
                  onKeyDown={e => {
                    if (e.key === "Enter" && newTeamName.trim()) createTeam.mutate(newTeamName.trim());
                  }}
                />
                <Button
                  size="sm"
                  onClick={() => createTeam.mutate(newTeamName.trim())}
                  disabled={!newTeamName.trim() || createTeam.isPending}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Team list */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                <Users2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Takımlar</span>
                <span className="ml-auto text-xs text-muted-foreground">{teams.length} takım</span>
              </div>
              {isLoading ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Yükleniyor…</div>
              ) : teams.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">Henüz takım yok</div>
              ) : (
                <div className="divide-y divide-border">
                  {teams.map(team => (
                    <div
                      key={team.id}
                      className={`flex items-center gap-2 px-4 py-3 cursor-pointer transition-colors ${
                        selectedTeamId === team.id ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-muted/30"
                      }`}
                      onClick={() => {
                        setSelectedTeamId(team.id === selectedTeamId ? null : team.id);
                        setAddSearch("");
                      }}
                    >
                      {editingId === team.id ? (
                        <>
                          <Input
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            className="h-7 text-sm"
                            onClick={e => e.stopPropagation()}
                            onKeyDown={e => {
                              if (e.key === "Enter") renameTeam.mutate({ id: team.id, name: editName.trim() });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                          />
                          <button
                            onClick={e => { e.stopPropagation(); renameTeam.mutate({ id: team.id, name: editName.trim() }); }}
                            className="p-1 text-emerald-600 hover:text-emerald-700"
                          ><Check className="h-3.5 w-3.5" /></button>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(null); }}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          ><X className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-medium truncate">{team.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{team.memberIds.length} üye</span>
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(team.id); setEditName(team.name); }}
                            className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                          ><Pencil className="h-3.5 w-3.5" /></button>
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              if (confirm(`"${team.name}" takımını silmek istediğinize emin misiniz?`))
                                deleteTeam.mutate(team.id);
                            }}
                            className="p-1 text-muted-foreground hover:text-red-500 shrink-0"
                          ><Trash2 className="h-3.5 w-3.5" /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: team member management ── */}
          <div className="lg:col-span-2 space-y-4">
            {!selectedTeam ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/10 p-12 text-center text-sm text-muted-foreground">
                Üyeleri yönetmek için sol panelden bir takım seçin
              </div>
            ) : (
              <>
                {/* Current members */}
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                    <Users2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{selectedTeam.name} — Üyeler</span>
                    <span className="ml-auto text-xs text-muted-foreground">{teamMembers.length} danışman</span>
                  </div>
                  {teamMembers.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground text-center">Bu takımda henüz üye yok</div>
                  ) : (
                    <div className="divide-y divide-border/50">
                      {teamMembers.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{emp.name}</p>
                            {emp.kwuid && <p className="text-xs text-muted-foreground font-mono">{emp.kwuid}</p>}
                          </div>
                          {emp.category && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 shrink-0 ${
                              emp.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : emp.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}>{emp.category}</span>
                          )}
                          <button
                            onClick={() => removeMember.mutate({ teamId: selectedTeam.id, employeeId: emp.id })}
                            className="p-1.5 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                            title="Takımdan çıkar"
                          >
                            <UserMinus className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add members */}
                <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold">Üye Ekle</span>
                  </div>
                  <div className="px-4 py-3 border-b border-border">
                    <Input
                      value={addSearch}
                      onChange={e => setAddSearch(e.target.value)}
                      placeholder="Danışman ara…"
                      className="h-8 text-sm"
                    />
                  </div>
                  {nonMembersFiltered.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground text-center">
                      {addSearch ? "Sonuç bulunamadı" : "Tüm aktif danışmanlar bu takımda"}
                    </div>
                  ) : (
                    <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                      {nonMembersFiltered.map(emp => (
                        <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{emp.name}</p>
                            {emp.kwuid && <p className="text-xs text-muted-foreground font-mono">{emp.kwuid}</p>}
                          </div>
                          {emp.category && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ring-1 shrink-0 ${
                              emp.category === "K2" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : emp.category === "K1" ? "bg-amber-50 text-amber-700 ring-amber-200"
                              : "bg-slate-50 text-slate-700 ring-slate-200"
                            }`}>{emp.category}</span>
                          )}
                          <button
                            onClick={() => addMember.mutate({ teamId: selectedTeam.id, employeeId: emp.id })}
                            className="p-1.5 text-muted-foreground hover:text-emerald-600 transition-colors shrink-0"
                            title="Takıma ekle"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
