import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useDashboardStats } from "@/hooks/use-stats";
import { StatusBadge, STAGE_COLORS } from "@/components/StatusBadge";
import { STAGE_LABELS } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import {
  Briefcase, Users, BarChart2, UserCheck, Calendar, TrendingUp,
  Clock, AlertTriangle, ArrowRight, ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  testId,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4 shadow-sm" data-testid={testId}>
      <div className={`rounded-lg p-2.5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        <p className="text-2xl font-display font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {href && (
        <Link href={href} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useDashboardStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/50" />)}
          </div>
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="h-64 rounded-xl bg-muted/50" />
            <div className="h-64 rounded-xl bg-muted/50" />
          </div>
        </div>
      </Layout>
    );
  }

  const funnelData = (stats?.funnel ?? []).filter((f: any) => f.stage !== "rejected");

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Overview as of {format(new Date(), "MMMM d, yyyy")}
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={Briefcase}
            label="Open Jobs"
            value={stats?.openJobs ?? 0}
            sub={`${stats?.totalJobs ?? 0} total positions`}
            color="bg-blue-50 text-blue-600"
            testId="kpi-open-jobs"
          />
          <KpiCard
            icon={TrendingUp}
            label="In Pipeline"
            value={stats?.inPipeline ?? 0}
            sub="Applied + Screening"
            color="bg-purple-50 text-purple-600"
            testId="kpi-in-pipeline"
          />
          <KpiCard
            icon={Calendar}
            label="Interviews"
            value={stats?.interviews ?? 0}
            sub="In interview stage"
            color="bg-amber-50 text-amber-600"
            testId="kpi-interviews"
          />
          <KpiCard
            icon={UserCheck}
            label="Hired"
            value={stats?.hired ?? 0}
            sub={`${stats?.offerAcceptanceRate ?? 0}% offer acceptance`}
            color="bg-emerald-50 text-emerald-600"
            testId="kpi-hired"
          />
        </div>

        {/* Main grid */}
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Funnel chart — takes 3 cols */}
          <div className="lg:col-span-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionHeader title="Recruitment Funnel" href="/reports" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={funnelData} barSize={36}>
                <XAxis
                  dataKey="stage"
                  tick={{ fontSize: 12, textTransform: "capitalize" }}
                  tickFormatter={(v) => STAGE_LABELS[v] ?? (v.charAt(0).toUpperCase() + v.slice(1))}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  formatter={(value: number) => [value, "Candidates"]}
                  labelFormatter={(l) => l.charAt(0).toUpperCase() + l.slice(1)}
                  contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {funnelData.map((entry: any) => (
                    <Cell key={entry.stage} fill={STAGE_COLORS[entry.stage] ?? "#94a3b8"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Upcoming interviews — takes 2 cols */}
          <div className="lg:col-span-2 rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
            <SectionHeader title="Scheduled Interviews" href="/interviews" />
            <div className="flex-1 space-y-3 overflow-y-auto">
              {stats?.upcomingInterviews?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No interviews scheduled</p>
              ) : (
                stats?.upcomingInterviews?.map((iv: any) => (
                  <div key={iv.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                      {(iv.candidate?.name ?? "??").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{iv.candidate?.name ?? "Candidate"}</p>
                      <p className="text-xs text-muted-foreground truncate">{iv.title} · {iv.job?.title}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {iv.startTime ? format(new Date(iv.startTime), "MMM d, h:mm a") : "TBD"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom grid */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent applications */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionHeader title="Recent Applications" href="/candidates" />
            <div className="space-y-3">
              {stats?.recentApplications?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No applications yet</p>
              ) : (
                stats?.recentApplications?.map((app: any) => (
                  <div key={app.id} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                      {app.candidate?.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{app.candidate?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{app.job?.title} · {app.job?.department}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={app.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stale jobs */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <SectionHeader title="Stale Jobs" href="/jobs" />
            {stats?.staleJobs?.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No stale jobs — great pipeline hygiene!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats?.staleJobs?.map((job: any) => (
                  <Link key={job.id} href={`/jobs/${job.id}`}>
                    <div className="flex items-center gap-3 hover:bg-muted/40 -mx-2 px-2 py-1.5 rounded-lg transition-colors cursor-pointer">
                      <div className="h-8 w-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{job.title}</p>
                        <p className="text-xs text-muted-foreground">
                          Open since {format(new Date(job.createdAt), "MMM d, yyyy")}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
