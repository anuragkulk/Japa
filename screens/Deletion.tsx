import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody, SiteFooter } from "@/components/shell";
import { Field, TextInput } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { navigate } from "@/lib/router";
import {
  ApiError,
  apiDeleteAccount,
  apiDeleteData,
  messageFor,
  type DeletionCounts,
  type DeletionResult,
} from "@/lib/api";

const TABLE_LABELS: Record<string, string> = {
  people: "people",
  japa_records: "Japa records",
  milestones: "milestones",
  devotional_images: "devotional images",
  devotional_texts: "typed devotionals",
  devotionals: "devotional entries",
  sessions: "sign-in sessions",
  users: "account",
};

function label(table: string) {
  return TABLE_LABELS[table] ?? table;
}

function countLines(deleted: DeletionCounts, kind: "account" | "data") {
  const lines = [
    `${deleted.people} ${deleted.people === 1 ? "person" : "people"}`,
    `${deleted.japaRecords} ${deleted.japaRecords === 1 ? "Japa record" : "Japa records"}`,
    `${deleted.milestones} ${deleted.milestones === 1 ? "milestone" : "milestones"}`,
    `${deleted.devotionals} ${deleted.devotionals === 1 ? "devotional" : "devotionals"}`,
    `${deleted.images} ${deleted.images === 1 ? "image file" : "image files"}`,
    `${deleted.texts} ${deleted.texts === 1 ? "typed devotional" : "typed devotionals"}`,
  ];
  if (kind === "account") lines.unshift("your account (name, email and password)");
  else lines.push("your account was kept");
  return lines;
}

function ResultPanel({ result, kind }: { result: DeletionResult; kind: "account" | "data" }) {
  if (result.status === "failed") {
    return (
      <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-5">
        <p className="font-display text-lg font-semibold text-destructive">
          Deletion could not be completed
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground/85">
          These could not be removed and are still stored:{" "}
          {result.failedTables.map(label).join(", ")}. Some of your other records may already have
          been deleted. Nothing was changed on any other account.
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground/85">
          Sign in again and repeat this request to finish the deletion, or try again later if the
          service was unavailable.
        </p>
      </div>
    );
  }

  const pendingFiles = result.status === "pending_files";
  return (
    <div
      className={
        pendingFiles
          ? "mt-6 rounded-2xl border border-accent/50 bg-accent/10 px-4 py-5"
          : "mt-6 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-5"
      }
    >
      <p className="font-display text-lg font-semibold text-foreground">
        {pendingFiles ? "Records deleted, files pending" : "Deletion completed"}
      </p>
      <ul className="mt-3 space-y-1 text-sm leading-6 text-foreground/85">
        {countLines(result.deleted, kind).map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-primary">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {pendingFiles && (
        <p className="mt-3 text-sm leading-6 text-foreground/85">
          {result.failedFiles} uploaded image file{result.failedFiles === 1 ? "" : "s"} could not be
          removed from storage even though their records are gone. They are no longer attached to
          your account and are not shown anywhere in Japa. Repeat this request later to clear them.
        </p>
      )}
      {result.account === "deleted" ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          You have been signed out. This cannot be undone.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Status confirmed by the Japa server for this request.
        </p>
      )}
    </div>
  );
}

function DeletionForm({ kind }: { kind: "account" | "data" }) {
  const { status, user, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DeletionResult | null>(null);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) {
      setError("Tick the confirmation box to continue.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r =
        kind === "account"
          ? await apiDeleteAccount(email.trim(), password)
          : await apiDeleteData(email.trim(), password);
      setResult(r);
      setPassword("");
      setConfirmed(false);
      if (kind === "account" && r.account === "deleted") await logout();
    } catch (e) {
      setError(e instanceof ApiError ? messageFor(e.code) : messageFor("network_error"));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading" && !result) {
    return (
      <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking your sign-in…
      </p>
    );
  }

  return (
    <>
      {result && <ResultPanel result={result} kind={kind} />}
      {status !== "authed" ? (
        !result && (
          <div className="mt-6 rounded-2xl border border-border bg-secondary/40 px-4 py-5 text-sm leading-6 text-foreground/85">
            For your security, deletion requires signing in first — the request is checked against
            the signed-in account and its password.
            <Button className="mt-4 rounded-full" variant="outline" onClick={() => navigate("/login")}>
              Sign in
            </Button>
          </div>
        )
      ) : (
        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          <Field label="Account email" hint="must match your signed-in account">
            <TextInput
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Current password" hint="verifies you own this account">
            <TextInput
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 px-4 py-3.5 text-sm leading-6 text-foreground/85">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-1 size-4 shrink-0 accent-primary"
            />
            <span>
              {kind === "account"
                ? "I understand this permanently deletes my Japa account and every record and image in it, and that it cannot be undone."
                : "I understand this permanently deletes every Japa record, person, milestone and devotional in my account, and that it cannot be undone."}
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-2xl bg-destructive text-[0.95rem] font-semibold text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {kind === "account" ? "Delete my account" : "Delete my records"}
          </Button>
        </form>
      )}
    </>
  );
}

function PageShell({
  title,
  intro,
  bullets,
  children,
}: {
  title: string;
  intro: string;
  bullets: string[];
  children: ReactNode;
}) {
  return (
    <Screen>
      <AppBar title={title} showBack />
      <PageBody>
        <article className="rounded-2xl border border-border bg-card px-5 py-7 shadow-soft sm:px-8">
          <p className="text-sm leading-7 text-foreground/85">{intro}</p>
          <ul className="mt-4 space-y-1.5 text-sm leading-6 text-foreground/85">
            {bullets.map((b) => (
              <li key={b} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {children}
        </article>
        <SiteFooter />
      </PageBody>
    </Screen>
  );
}

export function DeleteAccountPage() {
  return (
    <PageShell
      title="Delete Account"
      intro="Signing in and confirming with your current password is required, so only the owner of an account can delete it. Deleting your account removes:"
      bullets={[
        "your account itself — name, email and password",
        "every person you added, including the default “You”",
        "all Japa records and dates",
        "all milestones",
        "all devotionals: typed text and uploaded images, including the stored image files",
        "all active sign-in sessions",
      ]}
    >
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Rows and files are erased from Japa’s live database and storage as soon as the request
        completes. Hosting-platform backups may hold copies briefly until they expire, but nothing
        stays reachable from your account. This cannot be undone.
      </p>
      <DeletionForm kind="account" />
    </PageShell>
  );
}

export function DeleteDataPage() {
  return (
    <PageShell
      title="Delete My Data"
      intro="Keeps your account and sign-in, and clears the devotional data stored in it. Only your own records are touched — other Japa accounts are unaffected. Deletes:"
      bullets={[
        "every person you added, including the default “You”",
        "all Japa records and dates",
        "all milestones",
        "all devotionals: typed text and uploaded images, including the stored image files",
      ]}
    >
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Your name, email and password are retained, and Japa stays usable — the next entry you add
        recreates the default “You” person automatically. This cannot be undone.
      </p>
      <DeletionForm kind="data" />
    </PageShell>
  );
}
