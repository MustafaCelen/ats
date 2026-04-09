import { useState } from "react";
import { useLocation } from "wouter";
import { useLogin } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Lock, Mail, AlertCircle } from "lucide-react";
import { SiGoogle } from "react-icons/si";

export default function Login() {
  const [, navigate] = useLocation();
  const { mutate: login, isPending, error } = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login({ email, password }, { onSuccess: () => navigate("/dashboard") });
  };

  const handleGoogleLogin = async () => {
    try {
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      window.location.href = "/api/auth/google";
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* KW Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-[#CC0000] flex items-center justify-center shadow-lg mb-4">
            <Briefcase className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">HireFlow</h1>
          <p className="text-sm text-muted-foreground mt-1">Keller Williams Platin & Karma</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-center">Giriş Yap</h2>

          {/* Google Sign-In */}
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center gap-2 justify-center"
            onClick={handleGoogleLogin}
            data-testid="btn-google-login"
          >
            <SiGoogle className="h-4 w-4 text-[#4285F4]" />
            Google ile Giriş Yap
          </Button>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">veya</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@kw.com.tr"
                  className="pl-9"
                  required
                  data-testid="input-email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  required
                  data-testid="input-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" data-testid="login-error">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {(error as Error).message}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isPending} data-testid="btn-login">
              {isPending ? "Giriş yapılıyor..." : "E-posta ile Giriş Yap"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} Keller Williams Platin & Karma
        </p>
      </div>
    </div>
  );
}
