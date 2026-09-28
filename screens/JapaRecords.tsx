import { useCallback, useEffect, useState } from "react";
import { Flower2, Plus, Users, Pencil, Trash2, Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody, EmptyState } from "@/components/shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { apiListJapa, apiDeleteJapa, type JapaRecord } from "@/lib/api";
import { formatDateLong } from "@/lib/format";

export function JapaRecords() {
  const [records, setRecords] = useState<JapaRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<JapaRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return apiListJapa(signal)
      .then((items) => {
        setRecords(items);
        setError(null);
      })
      .catch((e) => {
        if (!signal?.aborted) setError(e?.message ?? "Could not load records.");
      });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  // Refresh when returning to this screen (e.g. after add/edit).
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDeleteJapa(pendingDelete.id);
      setRecords((prev) => (prev ? prev.filter((r) => r.id !== pendingDelete.id) : prev));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete record.");
    } finally {
      setDeleting(false);
    }
  }

  const sorted = (records ?? [])
    .slice()
    .sort((a, b) => (a.date === b.date ? a.personName.localeCompare(b.personName) : b.date.localeCompare(a.date)));

  return (
    <Screen withNav>
      <AppBar
        title="Japa Records"
        right={
          <button
            type="button"
            onClick={() => navigate("/people")}
            aria-label="Manage people"
            className="flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Users className="size-5" />
          </button>
        }
      />
      <PageBody withNav>
        {records === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : error && sorted.length === 0 ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<Flower2 className="size-6" />}
            message="No Japa records yet."
            actionLabel="+ Add Japa"
            onAction={() => navigate("/japa/add")}
          />
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((r) => (
              <li
                key={r.id}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-soft"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/70 font-display text-base text-primary">
                  {r.personName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.personName}</p>
                  <p className="text-xs text-muted-foreground">{formatDateLong(r.date)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="font-display text-xl font-semibold text-primary">
                    {r.japaCount}
                  </span>
                  <span className="ml-1 text-xs text-muted-foreground">japa</span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/japa/edit/${r.id}`)}
                    aria-label={`Edit ${r.personName}'s record`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(r)}
                    aria-label={`Delete ${r.personName}'s record`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {sorted.length > 0 && (
          <Button
            onClick={() => navigate("/japa/add")}
            className="mt-7 h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-soft"
          >
            <Plus className="size-4" /> Add Japa
          </Button>
        )}
      </PageBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this record?"
        message={
          pendingDelete
            ? `${pendingDelete.personName}'s ${pendingDelete.japaCount} japa on ${formatDateLong(pendingDelete.date)} will be removed.`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}
