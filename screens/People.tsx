import { useCallback, useEffect, useState } from "react";
import { Users, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody, EmptyState } from "@/components/shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { apiListPeople, apiDeletePerson, type Person } from "@/lib/api";

export function People() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Person | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return apiListPeople(signal)
      .then((items) => {
        setPeople(items);
        setError(null);
      })
      .catch((e) => {
        if (!signal?.aborted) setError(e?.message ?? "Could not load people.");
      });
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      ac.abort();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await apiDeletePerson(pending.id);
      setPeople((prev) => (prev ? prev.filter((p) => p.id !== pending.id) : prev));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete person.");
    } finally {
      setDeleting(false);
    }
  }

  const isYou = (p: Person) => p.name.trim().toLowerCase() === "you";
  const list = (people ?? [])
    .slice()
    .sort((a, b) => (Number(isYou(b)) - Number(isYou(a))) || a.name.localeCompare(b.name));

  return (
    <Screen>
      <AppBar title="People" showBack />
      <PageBody>
        {people === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" />}
            message="No people added yet."
            actionLabel="+ Add Person"
            onAction={() => navigate("/people/add")}
          />
        ) : (
          <ul className="space-y-2.5">
            {list.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft"
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt=""
                    className="size-11 shrink-0 rounded-full object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary/70 font-display text-lg text-primary">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/people/edit/${p.id}`)}
                    aria-label={`Edit ${p.name}`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(p)}
                    aria-label={`Delete ${p.name}`}
                    className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {list.length > 0 && (
          <Button
            onClick={() => navigate("/people/add")}
            className="mt-7 h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-soft"
          >
            <Plus className="size-4" /> Add Person
          </Button>
        )}
      </PageBody>

      <ConfirmDialog
        open={pending !== null}
        title="Remove this person?"
        message={
          pending
            ? `${pending.name} and all of their Japa records will be permanently removed.`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </Screen>
  );
}
