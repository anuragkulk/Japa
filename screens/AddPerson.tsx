import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/Field";
import { navigate } from "@/lib/router";
import {
  apiListPeople,
  apiCreatePerson,
  apiUpdatePerson,
  apiPersonPhotoIntent,
  apiPersonPhotoConfirm,
  putToSignedUrl,
  type Person,
} from "@/lib/api";
import { validateImage } from "@/lib/upload";

export function AddPerson({ editId }: { editId?: string }) {
  const isEdit = Boolean(editId);
  const [name, setName] = useState("");
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEdit) return;
    const ac = new AbortController();
    apiListPeople(ac.signal)
      .then((people) => {
        const p: Person | undefined = people.find((x) => x.id === editId);
        if (p) {
          setName(p.name);
          setExistingPhoto(p.photoUrl);
        } else {
          setError("That person could not be found.");
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load person."))
      .finally(() => !ac.signal.aborted && setLoading(false));
    return () => ac.abort();
  }, [editId, isEdit]);

  useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  function onPick(file: File | undefined) {
    if (!file) return;
    const invalid = validateImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setPhotoFile(file);
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPreview(null);
    setExistingPhoto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function uploadPhoto(personId: string, file: File) {
    const intent = await apiPersonPhotoIntent(personId, file.type, file.size);
    await putToSignedUrl(intent.intent.signedUrl, file);
    await apiPersonPhotoConfirm(personId, intent.intent.objectPath, file.size, file.type);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Enter a name.");
    setError(null);
    setBusy(true);
    try {
      let personId = editId!;
      if (isEdit) {
        await apiUpdatePerson(editId!, name.trim());
      } else {
        const created = await apiCreatePerson(name.trim());
        personId = created.person.id;
      }
      if (photoFile) await uploadPhoto(personId, photoFile);
      navigate("/people");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setBusy(false);
    }
  }

  const shownPhoto = preview ?? existingPhoto;

  return (
    <Screen>
      <AppBar title={isEdit ? "Edit Person" : "Add Person"} showBack />
      <PageBody>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="flex size-28 items-center justify-center overflow-hidden rounded-full border border-border bg-secondary/50 shadow-soft">
                  {shownPhoto ? (
                    <img src={shownPhoto} alt="Person" className="size-full object-cover" />
                  ) : (
                    <span className="font-display text-4xl text-primary">
                      {name.trim().charAt(0).toUpperCase() || "＋"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Choose photo"
                  className="absolute -bottom-1 -right-1 flex size-10 items-center justify-center rounded-full border border-border bg-card text-primary shadow-lift transition-colors hover:bg-secondary"
                >
                  <Camera className="size-5" />
                </button>
                {shownPhoto && (
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Remove photo"
                    className="absolute -top-1 -right-1 flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
              />
              <p className="mt-3 text-xs text-muted-foreground">Photo is optional</p>
            </div>

            <Field label="Name">
              <TextInput
                value={name}
                placeholder="e.g. Mother"
                onChange={(e) => setName(e.target.value)}
                autoFocus
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
                onClick={() => navigate("/people")}
                className="h-11 flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-xl">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Saving…" : "Save Person"}
              </Button>
            </div>
          </form>
        )}
      </PageBody>
    </Screen>
  );
}
