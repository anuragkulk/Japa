import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Flag } from "lucide-react";
import { AppBar, Screen, PageBody, SectionLabel } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/Field";
import { navigate } from "@/lib/router";
import {
  apiListMilestones,
  apiCreateMilestone,
  apiUpdateMilestone,
  type Milestone,
} from "@/lib/api";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const PREDEFINED = [
  { label: "1 Lakh Japa", value: 100_000 },
  { label: "1 Crore Japa", value: 10_000_000 },
  { label: "8 Crore Japa", value: 80_000_000 },
  { label: "10 Crore Japa", value: 100_000_000 },
];

export function AddMilestone({ editId }: { editId?: string }) {
  const isEdit = Boolean(editId);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await apiListMilestones(ac.signal);
        if (ac.signal.aborted) return;
        const m: Milestone | undefined = r.items.find((x) => x.id === editId);
        if (m) {
          setName(m.name);
          setTarget(String(m.targetCount));
        } else {
          setError("That milestone could not be found.");
        }
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : "Could not load milestone.");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [editId, isEdit]);

  const targetNum = useMemo(() => {
    const n = Number(target);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [target]);

  function choosePredefined(p: { label: string; value: number }) {
    setName(p.label);
    setTarget(String(p.value));
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (targetNum === null) {
      return setError("Enter a positive whole number for the target Japa count.");
    }
    setError(null);
    setBusy(true);
    try {
      const trimmed = name.trim();
      if (isEdit && editId) {
        await apiUpdateMilestone(editId, trimmed, targetNum);
      } else {
        await apiCreateMilestone(trimmed, targetNum);
      }
      navigate("/milestone");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Screen>
      <AppBar title={isEdit ? "Edit Milestone" : "Add Milestone"} showBack />
      <PageBody>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            <section>
              <SectionLabel>Predefined milestones</SectionLabel>
              <div className="grid grid-cols-2 gap-2.5">
                {PREDEFINED.map((p) => {
                  const active = targetNum === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => choosePredefined(p)}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                        active
                          ? "border-primary bg-secondary/50"
                          : "border-border bg-card hover:bg-secondary/30",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Flag className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground")} />
                        {p.label}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatCount(p.value)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-5">
              <SectionLabel>Create a custom milestone</SectionLabel>
              <Field label="Milestone name" hint="Optional">
                <TextInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Guru Purnima Sankalp"
                  maxLength={80}
                />
              </Field>
              <Field label="Target Japa count" hint="Positive whole number">
                <TextInput
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  placeholder="e.g. 50000"
                  value={target}
                  onChange={(e) => setTarget(e.target.value.replace(/[^0-9]/g, ""))}
                  className="font-display text-xl"
                />
              </Field>
              {targetNum !== null && (
                <p className="text-xs text-muted-foreground">
                  Target: {formatCount(targetNum)} japa. Progress is calculated automatically from
                  your saved Japa records.
                </p>
              )}
            </section>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/milestone")}
                className="h-11 flex-1 rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy} className="h-11 flex-[2] rounded-xl">
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {busy ? "Saving…" : isEdit ? "Save Changes" : "Save Milestone"}
              </Button>
            </div>
          </form>
        )}
      </PageBody>
    </Screen>
  );
}
