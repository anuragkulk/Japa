import { useCallback, useEffect, useState } from "react";
import { Images, Plus, Trash2, Loader2, BookOpen, PenLine } from "lucide-react";
import { AppBar, Screen, PageBody, EmptyState } from "@/components/shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import { apiListDevotionals, apiDeleteDevotional, type Devotional } from "@/lib/api";
import { languageLabel } from "@/lib/devotionalLanguages";

export function Devotionals() {
  const [items, setItems] = useState<Devotional[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Devotional | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback((signal?: AbortSignal) => {
    return apiListDevotionals(signal)
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e) => {
        if (!signal?.aborted) setError(e?.message ?? "Could not load devotionals.");
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
      await apiDeleteDevotional(pending.id);
      setItems((prev) => (prev ? prev.filter((d) => d.id !== pending.id) : prev));
      setPending(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  const list = (items ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Screen withNav>
      <AppBar title="Devotionals" />
      <PageBody withNav>
        {items === null && !error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Images className="size-6" />}
            message="No devotional collections yet."
            actionLabel="+ Add Devotional"
            onAction={() => navigate("/devotionals/add")}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
            {list.map((d) => (
              <div
                key={d.id}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-shadow hover:shadow-lift"
              >
                <button
                  type="button"
                  onClick={() => navigate(`/devotional/${d.id}`)}
                  className="block w-full text-left"
                  aria-label={`Open ${d.title || "Untitled devotional"}`}
                >
                  <div className="flex aspect-[3/4] w-full items-center justify-center bg-secondary/40">
                    {d.kind === "text" ? (
                      <div className="flex size-full flex-col items-center justify-center gap-2 px-4 text-primary/60">
                        <PenLine className="size-8" />
                        {d.preview && (
                          <p
                            dir="auto"
                            lang={d.language}
                            className="line-clamp-4 text-center text-xs leading-5 text-foreground/70"
                          >
                            {d.preview}
                          </p>
                        )}
                      </div>
                    ) : d.coverUrl ? (
                      <img src={d.coverUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <BookOpen className="size-8 text-primary/50" />
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="truncate font-medium text-foreground">
                      {d.title?.trim() ? d.title : <span className="text-muted-foreground">Untitled</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {d.kind === "text"
                        ? d.language
                          ? languageLabel(d.language)
                          : "Text"
                        : `${d.imageCount} ${d.imageCount === 1 ? "image" : "images"}`}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setPending(d)}
                  aria-label={`Delete ${d.title || "Untitled"}`}
                  className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-card/85 text-muted-foreground opacity-0 shadow-soft backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {list.length > 0 && (
          <Button
            onClick={() => navigate("/devotionals/add")}
            className="mt-7 h-12 w-full rounded-2xl text-[0.95rem] font-semibold shadow-soft"
          >
            <Plus className="size-4" /> Add Devotional
          </Button>
        )}
      </PageBody>

      <ConfirmDialog
        open={pending !== null}
        title="Delete this devotional?"
        message={
          pending
            ? pending.kind === "text"
              ? `"${pending.title?.trim() || "Untitled"}" will be permanently removed.`
              : `"${pending.title?.trim() || "Untitled"}" and its ${pending.imageCount} image(s) will be permanently removed.`
            : ""
        }
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </Screen>
  );
}
