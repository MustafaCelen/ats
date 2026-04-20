import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Briefcase, BarChart2, ChevronRight, Menu, X,
  Calendar, Shield, LogOut, ClipboardList, UserCheck, KanbanSquare, DollarSign,
} from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { useAuth, useLogout } from "@/hooks/use-auth";

interface LayoutProps { children: React.ReactNode; }

const hiringManagerNavItems = [
  { icon: Briefcase,       label: "Üretim Bandı", href: "/jobs" },
  { icon: Users,           label: "Adaylar",      href: "/candidates" },
  { icon: UserCheck,       label: "Danışmanlar",  href: "/employees" },
  { icon: Calendar,        label: "Randevular",   href: "/interviews" },
  { icon: KanbanSquare,    label: "Onboarding",   href: "/onboarding" },
  { icon: BarChart2,       label: "Raporlar",     href: "/reports" },
  { icon: ClipboardList,   label: "Görevler",     href: "/tasks" },
];

const adminNavItems = [
  { icon: LayoutDashboard, label: "Dashboard",   href: "/dashboard" },
  ...hiringManagerNavItems,
  { icon: Shield, label: "Users", href: "/users" },
];

const assistantNavItems = [
  { icon: Briefcase,     label: "Üretim Bandı", href: "/jobs" },
  { icon: Users,         label: "Adaylar",      href: "/candidates" },
  { icon: UserCheck,     label: "Danışmanlar",  href: "/employees" },
  { icon: Calendar,      label: "Randevular",   href: "/interviews" },
  { icon: KanbanSquare,  label: "Onboarding",   href: "/onboarding" },
  { icon: ClipboardList, label: "Görevler",     href: "/tasks" },
];

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: user } = useAuth();
  const { mutate: logout } = useLogout();

  const isAdmin = user?.role === "admin";
  const isAssistant = user?.role === "assistant";
  const navItems = isAdmin ? adminNavItems : isAssistant ? assistantNavItems : hiringManagerNavItems;

  const handleLogout = () => {
    logout(undefined, { onSuccess: () => { window.location.href = "/login"; } });
  };

  const NavList = () => (
    <nav className="flex-1 space-y-0.5 p-3">
      {navItems.map((item) => {
        const isActive = location === item.href || (item.href !== "/dashboard" && location.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={clsx(
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const currentLabel = navItems.find(
    (n) => location === n.href || (n.href !== "/dashboard" && location.startsWith(n.href))
  )?.label ?? "Page";

  const roleLabel = isAdmin ? "Admin" : isAssistant ? "Assistant" : "Hiring Manager";

  const UserPill = () => (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-2.5 rounded-lg bg-muted/60 px-3 py-2.5">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#CC0000] to-[#8B0000] flex items-center justify-center text-white text-xs font-bold shrink-0">
          {user ? user.name.slice(0, 2).toUpperCase() : "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold truncate">{user?.name ?? "..."}</p>
          <p className="text-[10px] text-muted-foreground truncate">{roleLabel}</p>
        </div>
        <button
          onClick={handleLogout}
          title="Çıkış Yap"
          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          data-testid="btn-logout"
        >
          <LogOut className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r border-border bg-card hidden md:flex flex-col">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
          <div className="h-7 w-7 rounded-lg bg-[#CC0000] flex items-center justify-center shrink-0">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="font-display text-base font-bold tracking-tight leading-none block">HireFlow</span>
            <span className="text-[10px] text-muted-foreground leading-none">KW Platin & Karma</span>
          </div>
        </div>

        {/* Role badge */}
        {(isAdmin || isAssistant) && (
          <div className="px-4 py-2 border-b border-border">
            {isAdmin ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold ring-1 ring-red-200">
                <Shield className="h-2.5 w-2.5" /> Admin
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold ring-1 ring-violet-200">
                <ClipboardList className="h-2.5 w-2.5" /> Assistant
              </span>
            )}
          </div>
        )}

        <NavList />
        <UserPill />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-56 bg-card border-r border-border flex flex-col z-10">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <span className="font-display text-lg font-bold">HireFlow</span>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList />
            <UserPill />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 md:ml-56 flex flex-col min-h-screen">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-sm">
          <button
            className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">HireFlow</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-foreground">{currentLabel}</span>
          </div>
          {!isAdmin && !isAssistant && user && (
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              Hiring Manager — {user.assignedJobIds?.length ?? 0} ilan
            </span>
          )}
          {isAssistant && (
            <span className="ml-auto text-xs text-muted-foreground bg-violet-50 text-violet-600 px-2 py-1 rounded-full">
              Assistant{user?.assignedJobIds?.length ? ` — ${user.assignedJobIds.length} ilan` : ""}
            </span>
          )}
        </header>

        <div className="flex-1 p-6 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
