import type { ReactNode } from "react";
import { ArrowLeft, Home, Flower2, Images, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { back, navigate, usePath } from "@/lib/router";
import { Button } from "@/components/ui/button";

export function AppBar({
  title,
  showBack = false,
  right,
  subtitle,
}: {
  title: string;
  showBack?: boolean;
  right?: ReactNode;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
        {showBack && (
          <button
            type="button"
            onClick={() => back()}
            aria-label="Go back"
            className="-ml-1 flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.7rem] leading-tight font-semibold text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="truncate text-xs tracking-wide text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}

// Full-page column: pages render their own <AppBar/> and a <PageBody/> so the
// sticky header spans the full width and the nav never overlaps content.
export function Screen({
  children,
  withNav = false,
}: {
  children: ReactNode;
  withNav?: boolean;
}) {
  return (
    <div className="flex min-h-full flex-col">
      {children}
      {withNav && <BottomNav />}
    </div>
  );
}

export function PageBody({
  children,
  withNav = false,
  className,
}: {
  children: ReactNode;
  withNav?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-3xl flex-1 px-4 pt-5",
        withNav ? "pb-28" : "pb-10",
        className,
      )}
    >
      {children}
    </div>
  );
}

const TABS = [
  { key: "home", label: "Home", path: "/home", Icon: Home, match: (p: string) => p === "/" || p.startsWith("/home") },
  { key: "japa", label: "Japa", path: "/japa", Icon: Flower2, match: (p: string) => p.startsWith("/japa") || p.startsWith("/people") },
  {
    key: "devotionals",
    label: "Devotionals",
    path: "/devotionals",
    Icon: Images,
    match: (p: string) => p.startsWith("/devotional"),
  },
  {
    key: "milestone",
    label: "Milestone",
    path: "/milestone",
    Icon: Flag,
    match: (p: string) => p.startsWith("/milestone"),
  },
] as const;

export function BottomNav() {
  const path = usePath();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/95 backdrop-blur-md [padding-bottom:env(safe-area-inset-bottom)]">
      <div className="mx-auto flex w-full max-w-3xl items-stretch">
        {TABS.map(({ key, label, path: p, Icon, match }) => {
          const active = match(path);
          return (
            <button
              key={key}
              type="button"
              onClick={() => navigate(p)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[0.7rem] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative flex items-center justify-center">
                <Icon className={cn("size-[1.35rem]", active && "drop-shadow-[0_1px_2px_rgba(185,118,46,0.35)]")} />
                {active && (
                  <span className="absolute -bottom-1.5 size-1 rounded-full bg-accent" />
                )}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function EmptyState({
  icon,
  message,
  actionLabel,
  onAction,
}: {
  icon?: ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary/70 text-primary">
        {icon ?? <Flower2 className="size-6" />}
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction && (
        <Button className="mt-6 rounded-full" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {children}
      </h2>
      <span className="hairline-gold h-px flex-1" />
    </div>
  );
}

const FOOTER_LINKS = [
  { href: "/privacy-policy", text: "Privacy Policy" },
  { href: "/delete-data", text: "Delete My Data" },
  { href: "/delete-account", text: "Delete Account" },
];

export function SiteFooter() {
  return (
    <footer className="mt-8 w-full pt-4 text-center text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {FOOTER_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="font-medium text-foreground/70 underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {link.text}
          </a>
        ))}
      </div>
    </footer>
  );
}
