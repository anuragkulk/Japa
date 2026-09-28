import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-[0.08em] text-foreground/80 uppercase">
          {label}
        </span>
        {hint && <span className="text-[0.7rem] font-normal normal-case text-muted-foreground">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 rounded-xl border-border bg-card px-3.5 text-[0.95rem] shadow-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

export function TextInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  return <Input className={cn(inputClass, className)} {...props} />;
}
