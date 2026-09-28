import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/Field";
import { Textarea } from "@/components/ui/textarea";
import { navigate } from "@/lib/router";
import {
  apiCreateTextDevotional,
  apiUpdateTextDevotional,
  apiGetDevotional,
} from "@/lib/api";

export function TypeDevotional({ editId }: { editId?: string }) {
  const isEdit = Boolean(editId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await apiGetDevotional(editId as string, ac.signal);
        if (ac.signal.aborted) return;
        if (r.devotional.kind !== "text") {
          setError("That devotional is not a typed one.");
        } else {
          setTitle(r.devotional.title ?? "");
          setContent(r.devotional.body ?? "");
        }
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load devotional.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [editId, isEdit]);

  const trimmed = content.trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (trimmed.length === 0) return setError("Please enter the devotional text.");
    setError(null);
    setBusy(true);
    try {
      if (isEdit && editId) {
        const r = await apiUpdateTextDevotional(editId, title.trim(), content);
        navigate(`/devotional/${r.devotional.id}`, true);
      } else {
        const r = await apiCreateTextDevotional(title.trim(), content);
        navigate(`/devotional/${r.devotional.id}`, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save devotional.");
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Type Devotional" showBack />
        <PageBody>
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        </PageBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title={isEdit ? "Edit Devotional" : "Type Devotional"} showBack />
      <PageBody>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <Field label="Title" hint="Optional">
            <TextInput
              value={title}
              placeholder="e.g. Shiva Stotra"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <Field label="Devotional text" hint="Type or paste in any script">
            <Textarea
              value={content}
              dir="auto"
              spellCheck={false}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the devotional text…"
              className="min-h-[16rem] resize-y rounded-xl border-border bg-card px-3.5 py-3 text-[1.05rem] leading-8 shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
            />
          </Field>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => navigate("/devotionals")}
              disabled={busy}
              className="h-11 flex-1 rounded-xl"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-xl">
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {busy ? "Saving…" : isEdit ? "Save Changes" : "Save Devotional"}
            </Button>
          </div>
        </form>
      </PageBody>
    </Screen>
  );
}
