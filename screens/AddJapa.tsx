import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Users, Minus, Plus } from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, TextInput, inputClass } from "@/components/Field";
import { navigate } from "@/lib/router";
import {
  apiListPeople,
  apiListJapa,
  apiCreateJapa,
  apiUpdateJapa,
  type Person,
  type JapaRecord,
} from "@/lib/api";
import { todayISO, isValidISODate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AddJapa({ editId }: { editId?: string }) {
  const isEdit = Boolean(editId);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [personId, setPersonId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [count, setCount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const [ppl, records] = await Promise.all([
          apiListPeople(ac.signal),
          isEdit ? apiListJapa(ac.signal) : Promise.resolve([] as JapaRecord[]),
        ]);
        if (ac.signal.aborted) return;
        setPeople(ppl);
        if (isEdit) {
          const rec = records.find((r) => r.id === editId);
          if (rec) {
            setPersonId(rec.personId);
            setDate(rec.date);
            setCount(String(rec.japaCount));
          } else {
            setError("That record could not be found.");
          }
        } else if (ppl.length === 1) {
          setPersonId(ppl[0].id);
        }
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load data.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [editId, isEdit]);

  const countNum = useMemo(() => {
    const n = Number(count);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [count]);

  function bump(delta: number) {
    const base = countNum ?? 0;
    const next = Math.max(0, base + delta);
    setCount(next === 0 ? "" : String(next));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!personId) return setError("Select a person.");
    if (!isValidISODate(date)) return setError("Choose a valid date.");
    if (countNum === null) return setError("Enter a positive whole number for the Japa count.");
    setError(null);
    setBusy(true);
    try {
      if (isEdit && editId) {
        await apiUpdateJapa(editId, personId, date, countNum);
      } else {
        await apiCreateJapa(personId, date, countNum);
      }
      navigate("/japa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setBusy(false);
    }
  }

  const noPeople = people !== null && people.length === 0;

  return (
    <Screen>
      <AppBar title={isEdit ? "Edit Japa" : "Add Japa"} showBack />
      <PageBody>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : noPeople ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center shadow-soft">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-secondary/70 text-primary">
              <Users className="size-5" />
            </div>
            <p className="font-medium text-foreground">Add a person first</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              Japa is recorded for each family member. Add the people in your family to begin.
            </p>
            <Button className="mt-5 rounded-full" onClick={() => navigate("/people/add")}>
              <Plus className="size-4" /> Add Person
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            <Field label="Person">
              <select
                className={cn(inputClass, "appearance-none pr-8")}
                value={personId}
                onChange={(e) => setPersonId(e.target.value)}
              >
                <option value="">Select a person…</option>
                {(people ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date">
              <TextInput
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field label="Japa count" hint="Positive whole number">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => bump(-1)}
                  aria-label="Decrease count"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-secondary"
                >
                  <Minus className="size-4" />
                </button>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="e.g. 108"
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
                  className="text-center font-count text-3xl font-medium text-foreground"
                />
                <button
                  type="button"
                  onClick={() => bump(1)}
                  aria-label="Increase count"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground transition-colors hover:bg-secondary"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </Field>

            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                If this person already has an entry for the chosen date, the amount is added to
                that day's total.
              </p>
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
                onClick={() => navigate("/japa")}
                className="h-11 flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-xl">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Saving…" : isEdit ? "Save Changes" : "Save Japa"}
              </Button>
            </div>
          </form>
        )}
      </PageBody>
    </Screen>
  );
}
