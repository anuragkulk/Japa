import { useEffect, useRef, useState, type FormEvent } from "react";
import { Plus, X, Loader2, Images } from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/Field";
import { navigate } from "@/lib/router";
import {
  apiCreateDevotional,
  apiImageIntent,
  apiImageConfirm,
  putToSignedUrl,
} from "@/lib/api";
import { validateImage } from "@/lib/upload";

type Picked = { id: string; file: File; url: string };

export function AddDevotional() {
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => picked.forEach((p) => URL.revokeObjectURL(p.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPick(files: FileList | null) {
    if (!files) return;
    const next: Picked[] = [];
    for (const file of Array.from(files)) {
      const invalid = validateImage(file);
      if (invalid) {
        setError(invalid);
        continue;
      }
      next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) });
    }
    if (next.length) {
      setError(null);
      setPicked((prev) => [...prev, ...next]);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function remove(id: string) {
    setPicked((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (picked.length === 0) return setError("Add at least one image.");
    setError(null);
    setBusy(true);
    try {
      const { devotional } = await apiCreateDevotional(title.trim());
      setProgress({ done: 0, total: picked.length });
      for (let i = 0; i < picked.length; i++) {
        const file = picked[i].file;
        const intent = await apiImageIntent(devotional.id, file.type, file.size);
        await putToSignedUrl(intent.intent.signedUrl, file);
        await apiImageConfirm(devotional.id, intent.intent.objectPath, file.size, file.type);
        setProgress({ done: i + 1, total: picked.length });
      }
      navigate(`/devotional/${devotional.id}`, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save devotional.");
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <Screen>
      <AppBar title="Add Devotional" showBack />
      <PageBody>
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <Field label="Title" hint="Optional">
            <TextInput
              value={title}
              placeholder="e.g. Vishnu Sahasranamam"
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <div>
            <span className="mb-2 block text-xs font-semibold tracking-[0.08em] text-foreground/80 uppercase">
              Images
            </span>

            {picked.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {picked.map((p) => (
                  <div
                    key={p.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-secondary/40"
                  >
                    <img src={p.url} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label="Remove image"
                      className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-card/85 text-muted-foreground shadow-soft backdrop-blur transition-colors hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/60 px-6 py-8 text-primary transition-colors hover:bg-secondary/40"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-secondary/70">
                <Images className="size-5" />
              </span>
              <span className="text-sm font-medium">Add Images</span>
              <span className="text-xs text-muted-foreground">
                Upload prayers, stotras, mantras or book pages
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onPick(e.target.files)}
            />
          </div>

          {progress && (
            <div className="rounded-xl bg-secondary/50 px-4 py-3 text-sm text-foreground">
              Uploading image {progress.done} of {progress.total}…
            </div>
          )}

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
              {busy ? "Saving…" : "Save Devotional"}
            </Button>
          </div>
        </form>
      </PageBody>
    </Screen>
  );
}
