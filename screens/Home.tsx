import { useEffect, useMemo, useState } from "react";
import { Flower2, LogOut, Plus, Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody, SectionLabel, EmptyState, SiteFooter } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { navigate } from "@/lib/router";
import { apiListJapa, type JapaRecord } from "@/lib/api";
import { formatTodayHeader, todayISO } from "@/lib/format";

export function Home() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState<JapaRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    apiListJapa(ac.signal)
      .then(setRecords)
      .catch((e) => {
        if (!ac.signal.aborted) setError(e?.message ?? "Could not load today's Japa.");
      });
    return () => ac.abort();
  }, []);

  const todays = useMemo(() => {
    if (!records) return [];
    const today = todayISO();
    const byPerson = new Map<string, { name: string; total: number }>();
    for (const r of records) {
      if (r.date !== today) continue;
      const entry = byPerson.get(r.personId) ?? { name: r.personName, total: 0 };
      entry.total += r.japaCount;
      byPerson.set(r.personId, entry);
    }
    return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  const firstName = user?.name?.split(" ")[0] || "";

  return (
    <Screen withNav>
      <AppBar
        title="Japa"
        subtitle={formatTodayHeader()}
        right={
          <button
            type="button"
            onClick={() => {
              void logout().then(() => navigate("/login", true));
            }}
            aria-label="Logout"
            className="flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <LogOut className="size-5" />
          </button>
        }
      />

      <PageBody withNav>
        {firstName && (
          <p className="mt-6 font-display text-2xl text-foreground">
            Namaste, <span className="text-primary">{firstName}</span>
          </p>
        )}

        <div className="mt-7">
          <SectionLabel>Today's Japa</SectionLabel>

          {records === null && !error ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
              {error}
            </div>
          ) : todays.length === 0 ? (
            <EmptyState
              icon={<Flower2 className="size-6" />}
              message="No Japa recorded for today."
            />
          ) : (
            <ul className="space-y-2.5">
              {todays.map((p) => (
                <li
                  key={p.name}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 shadow-soft"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-secondary/70 font-display text-base text-primary">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium text-foreground">{p.name}</span>
                  </div>
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-display text-2xl font-semibold text-primary">
                      {p.total}
                    </span>
                    <span className="text-xs text-muted-foreground">japa</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button
          onClick={() => navigate("/japa/add")}
          className="mt-8 h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-soft"
        >
          <Plus className="size-4" /> Add Japa
        </Button>

        <SiteFooter />
      </PageBody>
    </Screen>
  );
}
