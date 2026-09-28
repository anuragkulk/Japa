import { useState, type FormEvent } from "react";
import { Flower2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/Field";
import { useAuth } from "@/lib/auth";
import { navigate } from "@/lib/router";
import { ApiError } from "@/lib/api";

function AuthShell({
  title,
  tagline,
  children,
  footer,
}: {
  title: string;
  tagline: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-5 py-10">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="mb-3 flex size-14 items-center justify-center rounded-2xl border border-accent/40 bg-card text-primary shadow-soft">
          <Flower2 className="size-7" />
        </div>
        <p className="font-display text-4xl font-semibold tracking-tight text-foreground">Japa</p>
        <p className="mt-1 text-sm text-muted-foreground">{tagline}</p>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-lift">
        <h1 className="mb-5 font-display text-2xl font-semibold text-foreground">{title}</h1>
        {children}
      </div>

      <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div>
    </div>
  );
}

function isEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) return setError("Enter a valid email address.");
    if (!password) return setError("Enter your password.");
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate("/home", true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      tagline="A quiet place for your family's daily practice"
      footer={
        <>
          New here?{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => navigate("/signup")}
          >
            Create an account
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-[0.95rem]">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Signing in…" : "Login"}
        </Button>
      </form>
    </AuthShell>
  );
}

export function Signup() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter your name.");
    if (!isEmail(email)) return setError("Enter a valid email address.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError(null);
    setBusy(true);
    try {
      await signup(name.trim(), email.trim(), password);
      navigate("/home", true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create account. Please try again.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      tagline="Record Japa and keep your devotional images"
      footer={
        <>
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Name">
          <TextInput
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" hint="At least 6 characters">
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm password">
          <TextInput
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl text-[0.95rem]">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Creating…" : "Create Account"}
        </Button>
      </form>
    </AuthShell>
  );
}
