import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Jobs from "@/pages/Jobs";
import JobDetails from "@/pages/JobDetails";
import Candidates from "@/pages/Candidates";
import CandidateDetail from "@/pages/CandidateDetail";
import Interviews from "@/pages/Interviews";
import Reports from "@/pages/Reports";
import Users from "@/pages/Users";
import Tasks from "@/pages/Tasks";
import Employees from "@/pages/Employees";
import OnboardingBoard from "@/pages/OnboardingBoard";
import Closings from "@/pages/Closings";

function ProtectedRoute({
  children,
  adminOnly = false,
  noAssistant = false,
}: {
  children: React.ReactNode;
  adminOnly?: boolean;
  noAssistant?: boolean;
}) {
  const { data: user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }
  if (!user) return <Redirect to="/login" />;
  if (adminOnly && user.role !== "admin") return <Redirect to="/dashboard" />;
  if (noAssistant && user.role === "assistant") return <Redirect to="/tasks" />;
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <Redirect to="/dashboard" />} />
      <Route path="/dashboard" component={() => <ProtectedRoute noAssistant><Dashboard /></ProtectedRoute>} />
      <Route path="/jobs" component={() => <ProtectedRoute><Jobs /></ProtectedRoute>} />
      <Route path="/jobs/:id" component={() => <ProtectedRoute><JobDetails /></ProtectedRoute>} />
      <Route path="/candidates" component={() => <ProtectedRoute><Candidates /></ProtectedRoute>} />
      <Route path="/candidates/:id" component={() => <ProtectedRoute><CandidateDetail /></ProtectedRoute>} />
      <Route path="/interviews" component={() => <ProtectedRoute><Interviews /></ProtectedRoute>} />
      <Route path="/reports" component={() => <ProtectedRoute noAssistant><Reports /></ProtectedRoute>} />
      <Route path="/users" component={() => <ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
      <Route path="/tasks" component={() => <ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/employees" component={() => <ProtectedRoute><Employees /></ProtectedRoute>} />
      <Route path="/onboarding" component={() => <ProtectedRoute><OnboardingBoard /></ProtectedRoute>} />
      <Route path="/closings" component={() => <ProtectedRoute><Closings /></ProtectedRoute>} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
