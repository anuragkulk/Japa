import { useCallback, useEffect, useState } from "react";
import { Flag, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody, EmptyState } from "@/components/shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { apiListMilestones, apiDeleteMilestone, type Milestone } from "@/lib/api";
import { formatCount } from "@/lib/format";

function displayName(m: Milestone): string {
  const n = m.name.trim();
  return n ? n : `${formatCount(m.targetCount)} Japa`;
}

export function Milestones() {
  const [items, setItems] = useState<Milestone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Milestone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return apiListMilestones(signal)
      .then((r) => {
        setItems(r.items);
        setError(null);
      })
      .catch((e) => {
        if (!signal?.aborted) setError(e?.message ?? "Could not load milestones.");
      });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  // Refresh when returning to this screen so progress reflects new Japa.
  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await apiDeleteMilestone(pendingDelete.id);
      setItems((prev) => (prev ? prev.filter((m) => m.id !== pendingDelete.id) : prev));
      setPendingDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete milestone.");
    } finally {
      setDeleting(false);
    }
  }

  const list = items ?? [];

  return (
    <Screen withNav>
      <AppBar title="Milestones" />
      <PageBody withNav>
        {items === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : error && list.length === 0 ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Flag className="size-6" />}
            message="No milestones yet."
            actionLabel="+ Add Milestone"
            onAction={() => navigate("/milestone/add")}
          />
        ) : (
          <ul className="space-y-3">
            {list.map((m) => {
              const pct = m.targetCount > 0 ? Math.min(100, (m.currentCount / m.targetCount) * 100) : 0;
              const reached = m.remaining <= 0;
              return (
                <li
                  key={m.id}
                  className="rounded-2xl border border-border bg-card px-4 py-4 shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-primary">
                      <Flag className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-lg font-semibold text-foreground">
                        {displayName(m)}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        <span className="font-medium text-primary">{formatCount(m.currentCount)}</span>
                        {" / "}
                        {formatCount(m.targetCount)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/milestone/edit/${m.id}`)}
                        aria-label={`Edit ${displayName(m)}`}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(m)}
                        aria-label={`Delete ${displayName(m)}`}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div
                    className="mt-3.5 h-2 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={Math.round(pct)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${displayName(m)} progress`}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {reached ? "Target reached." : `${formatCount(m.remaining)} remaining`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {list.length > 0 && (
          <Button
            onClick={() => navigate("/milestone/add")}
            className="mt-7 h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-soft"
          >
            <Plus className="size-4" /> Add Milestone
          </Button>
        )}
      </PageBody>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this milestone?"
        message={
          pendingDelete
            ? `"${displayName(pendingDelete)}" will be removed. Your Japa records are not affected.`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}
