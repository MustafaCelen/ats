import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useJobs, useCreateJob, useDeleteJob } from "@/hooks/use-jobs";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertJobSchema, type InsertJob } from "@shared/schema";
import {
  Plus, Search, MapPin, Building2, Briefcase, MoreHorizontal,
  ChevronRight, DollarSign, Tag,
} from "lucide-react";
import { format } from "date-fns";
import { motion } from "framer-motion";

const DEPARTMENTS = [
  "Engineering", "Product", "Design", "Marketing", "Sales",
  "Operations", "HR", "Finance", "Legal", "General",
];

export default function Jobs() {
  const { data: jobs, isLoading } = useJobs();
  const { mutate: deleteJob } = useDeleteJob();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = jobs?.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.company.toLowerCase().includes(search.toLowerCase()) ||
      job.department?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Positions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage open roles and track applicants</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search jobs..."
                className="pl-8 w-52 h-9 text-sm bg-card"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-job-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9 text-sm bg-card" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <CreateJobDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-52 rounded-xl bg-muted/40 animate-pulse" />)}
          </div>
        ) : filtered?.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No positions found. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered?.map((job, idx) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                data-testid={`card-job-${job.id}`}
              >
                <div className="group relative h-full rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-200">
                  {/* Actions */}
                  <div className="absolute top-4 right-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-muted rounded-lg transition-all text-muted-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => deleteJob(job.id)} className="text-destructive">
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Link href={`/jobs/${job.id}`} className="block h-full">
                    <div className="mb-3 flex items-center gap-2">
                      <StatusBadge status={job.status} />
                      {job.department && (
                        <span className="text-xs text-muted-foreground font-medium bg-muted px-2 py-0.5 rounded">
                          {job.department}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display font-semibold text-foreground text-lg leading-tight mb-3 group-hover:text-primary transition-colors pr-6">
                      {job.title}
                    </h3>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.company}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{job.location}</span>
                      </div>
                      {job.salaryRange && (
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5 shrink-0" />
                          <span>{job.salaryRange}</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                      <span>Posted {format(new Date(job.createdAt!), "MMM d, yyyy")}</span>
                      <span className="flex items-center gap-1 text-primary font-medium">
                        View Board <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function CreateJobDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { mutate, isPending } = useCreateJob();
  const form = useForm<InsertJob>({
    resolver: zodResolver(insertJobSchema),
    defaultValues: {
      title: "", department: "Engineering", company: "", location: "",
      description: "", requirements: "", salaryRange: "", status: "open",
    },
  });

  const onSubmit = (data: InsertJob) => {
    mutate(data, { onSuccess: () => { onOpenChange(false); form.reset(); } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 shadow-sm" data-testid="btn-create-job">
          <Plus className="mr-1.5 h-4 w-4" /> New Job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]" aria-describedby="create-job-desc">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Create New Position</DialogTitle>
          <p id="create-job-desc" className="text-sm text-muted-foreground">Fill in the details for the new job posting.</p>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Job Title</label>
              <Input {...form.register("title")} placeholder="e.g. Senior Frontend Engineer" data-testid="input-job-title" />
              {form.formState.errors.title && <p className="text-destructive text-xs">{form.formState.errors.title.message}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Department</label>
              <Select value={form.watch("department")} onValueChange={(v) => form.setValue("department", v)}>
                <SelectTrigger data-testid="select-department"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Company</label>
              <Input {...form.register("company")} placeholder="e.g. Acme Inc" data-testid="input-job-company" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Location</label>
              <Input {...form.register("location")} placeholder="e.g. Remote / NYC" data-testid="input-job-location" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Salary Range</label>
              <Input {...form.register("salaryRange")} placeholder="e.g. $120k–$160k" data-testid="input-job-salary" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Status</label>
              <Select value={form.watch("status")} onValueChange={(v) => form.setValue("status", v)}>
                <SelectTrigger data-testid="select-job-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea {...form.register("description")} placeholder="Role responsibilities..." rows={3} data-testid="textarea-job-description" />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Requirements</label>
            <Textarea {...form.register("requirements")} placeholder="Skills and qualifications needed..." rows={2} data-testid="textarea-job-requirements" />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isPending} data-testid="btn-submit-job">
              {isPending ? "Creating..." : "Create Position"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
