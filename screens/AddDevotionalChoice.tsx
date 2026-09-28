import { Images, PenLine, ChevronRight } from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { navigate } from "@/lib/router";

export function AddDevotionalChoice() {
  return (
    <Screen>
      <AppBar title="Add Devotional" showBack />
      <PageBody>
        <p className="mb-4 text-sm text-muted-foreground">Choose how you would like to add this devotional.</p>
        <div className="space-y-3.5">
          <ChoiceCard
            icon={<Images className="size-6" />}
            title="Add Image"
            description="Upload prayers, stotras, mantras or book pages as images."
            onClick={() => navigate("/devotionals/add/image")}
          />
          <ChoiceCard
            icon={<PenLine className="size-6" />}
            title="Type Devotional"
            description="Write or paste a devotional in any language or script."
            onClick={() => navigate("/devotionals/add/text")}
          />
        </div>
      </PageBody>
    </Screen>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-soft transition-colors hover:bg-secondary/40"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary/70 text-primary">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}
