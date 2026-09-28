import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  ZoomOut,
  Trash2,
  Pencil,
  GripVertical,
  Loader2,
  Maximize2,
  Check,
} from "lucide-react";
import { AppBar, Screen, PageBody } from "@/components/shell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/Field";
import { navigate } from "@/lib/router";
import {
  apiGetDevotional,
  apiDeleteImage,
  apiDeleteDevotional,
  apiUpdateDevotional,
  apiReorderImages,
  type Devotional,
  type DevotionalImage,
} from "@/lib/api";
import { languageInfo, languageLabel } from "@/lib/devotionalLanguages";
import { cn } from "@/lib/utils";

export function DevotionalViewer({ id }: { id: string }) {
  const [devotional, setDevotional] = useState<Devotional | null>(null);
  const [images, setImages] = useState<DevotionalImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<DevotionalImage | null>(null);
  const [confirmDeleteDev, setConfirmDeleteDev] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      apiGetDevotional(id, signal)
        .then((r) => {
          setDevotional(r.devotional);
          setImages(r.images);
          setError(null);
        })
        .catch((e) => {
          if (!signal?.aborted) setError(e?.message ?? "Could not load devotional.");
        }),
    [id],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, (images?.length ?? 1) - 1)));
  }, [images?.length]);

  function scrollTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(i, (images?.length ?? 1) - 1));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: "smooth" });
    setIndex(clamped);
  }

  function onScrollTrack() {
    const el = scroller.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (i !== index) setIndex(i);
  }

  async function saveTitle() {
    if (!devotional) return;
    setBusy(true);
    try {
      const r = await apiUpdateDevotional(devotional.id, titleDraft.trim());
      setDevotional(r.devotional);
      setEditingTitle(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update title.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteImage() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await apiDeleteImage(pendingDelete.id);
      setImages((prev) => (prev ? prev.filter((im) => im.id !== pendingDelete.id) : prev));
      setPendingDelete(null);
      setFullscreen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete image.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteDevotional() {
    if (!devotional) return;
    setBusy(true);
    try {
      await apiDeleteDevotional(devotional.id);
      navigate("/devotionals", true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete devotional.");
      setBusy(false);
    }
  }

  function move(from: number, dir: -1 | 1) {
    setImages((prev) => {
      if (!prev) return prev;
      const next = prev.slice();
      const to = from + dir;
      if (to < 0 || to >= next.length) return prev;
      [next[from], next[to]] = [next[to], next[from]];
      return next.map((im, i) => ({ ...im, pageOrder: i }));
    });
  }

  async function saveOrder() {
    if (!images || !devotional) return;
    setBusy(true);
    try {
      await apiReorderImages(
        devotional.id,
        images.map((im) => im.id),
      );
      setReorder(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save order.");
    } finally {
      setBusy(false);
    }
  }

  const list = images ?? [];
  const title = devotional?.title?.trim() ? devotional.title : "Untitled";

  if (images === null && !error) {
    return (
      <Screen>
        <AppBar title="Devotional" showBack />
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      </Screen>
    );
  }

  if (devotional?.kind === "text") {
    const info = languageInfo(devotional.language);
    return (
      <Screen>
        <AppBar
          title={title}
          showBack
          right={
            <button
              type="button"
              onClick={() => navigate(`/devotionals/edit-text/${devotional.id}`)}
              aria-label="Edit devotional"
              className="flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="size-[1.15rem]" />
            </button>
          }
        />
        <PageBody>
          {error && (
            <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <article className="rounded-2xl border border-border bg-card px-5 py-7 shadow-soft sm:px-8 sm:py-10">
            {devotional.title?.trim() && (
              <h2
                dir="auto"
                lang={info?.bcp47}
                className={cn(
                  "text-center font-display text-3xl font-semibold leading-snug text-foreground",
                  devotional.language ? "mb-2" : "mb-8",
                )}
              >
                {devotional.title}
              </h2>
            )}
            {devotional.language && (
              <p className="mb-8 text-center text-xs tracking-wide text-muted-foreground">
                {languageLabel(devotional.language)}
              </p>
            )}
            <div
              dir="auto"
              lang={info?.bcp47 ?? undefined}
              className="whitespace-pre-wrap text-center text-[1.15rem] leading-[2] text-foreground/90 sm:text-lg"
            >
              {devotional.body ?? ""}
            </div>
          </article>
          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteDev(true)}
              className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" /> Delete devotional
            </Button>
          </div>
        </PageBody>
        <ConfirmDialog
          open={confirmDeleteDev}
          title="Delete this devotional?"
          message={`"${title}" will be permanently removed.`}
          busy={busy}
          onConfirm={confirmDeleteDevotional}
          onCancel={() => setConfirmDeleteDev(false)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar
        title={title}
        showBack
        right={
          <>
            <button
              type="button"
              onClick={() => {
                setTitleDraft(devotional?.title ?? "");
                setEditingTitle(true);
              }}
              aria-label="Edit title"
              className="flex size-10 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="size-[1.15rem]" />
            </button>
            {list.length > 1 && (
              <button
                type="button"
                onClick={() => setReorder((r) => !r)}
                aria-label="Reorder images"
                className={cn(
                  "flex size-10 items-center justify-center rounded-full transition-colors",
                  reorder ? "bg-primary text-primary-foreground" : "text-foreground/70 hover:bg-secondary hover:text-foreground",
                )}
              >
                <GripVertical className="size-[1.15rem]" />
              </button>
            )}
          </>
        }
      />
      <PageBody>
        {error && (
          <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">This devotional has no images yet.</p>
            <Button className="mt-5 rounded-full" onClick={() => navigate("/devotionals")}>
              Back to Devotionals
            </Button>
          </div>
        ) : reorder ? (
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Use the arrows to change the page order, then save.
            </p>
            <ul className="space-y-2">
              {list.map((im, i) => (
                <li
                  key={im.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 shadow-soft"
                >
                  <img src={im.url} alt="" className="size-14 rounded-lg object-cover" />
                  <span className="flex-1 text-sm text-muted-foreground">Page {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === list.length - 1}
                    aria-label="Move down"
                    className="flex size-9 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-secondary disabled:opacity-30"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
            <Button onClick={saveOrder} disabled={busy} className="mt-5 h-11 w-full rounded-xl">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Save Order
            </Button>
          </div>
        ) : (
          <div>
            <div className="relative overflow-hidden rounded-2xl border border-border bg-secondary/30 shadow-soft">
              <div
                ref={scroller}
                onScroll={onScrollTrack}
                className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
              >
                {list.map((im) => (
                  <div key={im.id} className="flex w-full shrink-0 snap-center items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setFullscreen(true)}
                      className="flex aspect-[3/4] w-full items-center justify-center"
                      aria-label="View full screen"
                    >
                      <img src={im.url} alt="" className="size-full object-contain" />
                    </button>
                  </div>
                ))}
              </div>

              {list.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollTo(index - 1)}
                    disabled={index === 0}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground shadow-soft backdrop-blur transition-opacity disabled:opacity-0"
                  >
                    <ChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo(index + 1)}
                    disabled={index >= list.length - 1}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground shadow-soft backdrop-blur transition-opacity disabled:opacity-0"
                  >
                    <ChevronRight className="size-5" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setFullscreen(true)}
                aria-label="Full screen"
                className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-card/80 text-foreground shadow-soft backdrop-blur hover:bg-card"
              >
                <Maximize2 className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {list.map((im, i) => (
                  <button
                    key={im.id}
                    type="button"
                    onClick={() => scrollTo(i)}
                    aria-label={`Go to image ${i + 1}`}
                    className={cn(
                      "size-2 rounded-full transition-all",
                      i === index ? "w-5 bg-primary" : "bg-border hover:bg-muted-foreground/50",
                    )}
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {index + 1} / {list.length}
              </span>
            </div>

            <div className="mt-5 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setPendingDelete(list[index])}
                className="rounded-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" /> Delete this image
              </Button>
            </div>
          </div>
        )}
      </PageBody>

      {editingTitle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm"
          onClick={() => !busy && setEditingTitle(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-semibold text-foreground">Edit title</h3>
            <p className="mt-1 text-xs text-muted-foreground">Leave blank to keep it untitled.</p>
            <TextInput
              className="mt-4"
              value={titleDraft}
              placeholder="Devotional title"
              onChange={(e) => setTitleDraft(e.target.value)}
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="ghost" className="rounded-full" disabled={busy} onClick={() => setEditingTitle(false)}>
                Cancel
              </Button>
              <Button className="rounded-full" disabled={busy} onClick={saveTitle}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {fullscreen && list[index] && (
        <FullscreenImage
          images={list}
          index={index}
          onIndex={setIndex}
          onClose={() => setFullscreen(false)}
          onDelete={() => setPendingDelete(list[index])}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this image?"
        message="This image will be permanently removed from the devotional."
        busy={busy}
        onConfirm={confirmDeleteImage}
        onCancel={() => setPendingDelete(null)}
      />
    </Screen>
  );
}

/* ------------------------- Fullscreen zoom + swipe ------------------------ */

function FullscreenImage({
  images,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  images: DevotionalImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setScale(1);
    setTx(0);
    setTy(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && index < images.length - 1) onIndex(index + 1);
      if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, images.length, onClose, onIndex]);

  function clampScale(s: number) {
    return Math.max(1, Math.min(5, s));
  }
  function zoomBy(factor: number) {
    setScale((s) => {
      const next = clampScale(s * factor);
      if (next === 1) {
        setTx(0);
        setTy(0);
      }
      return next;
    });
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
    } else if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
      touchStart.current = { x: e.clientX, y: e.clientY };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setScale(clampScale((pinch.current.scale * dist) / pinch.current.dist));
      return;
    }
    if (drag.current && scale > 1) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
      setTx(drag.current.tx + dx);
      setTy(drag.current.ty + dy);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0 && scale === 1 && touchStart.current) {
      const dx = e.clientX - touchStart.current.x;
      const dy = e.clientY - touchStart.current.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0 && index < images.length - 1) onIndex(index + 1);
        else if (dx > 0 && index > 0) onIndex(index - 1);
      }
    }
    drag.current = null;
    touchStart.current = null;
  }

  const img = images[index];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-3 py-3 text-white/90">
        <button type="button" onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
          <X className="size-6" />
        </button>
        <span className="text-sm tabular-nums">
          {index + 1} / {images.length}
        </span>
        <button type="button" onClick={onDelete} aria-label="Delete image" className="flex size-10 items-center justify-center rounded-full hover:bg-white/10">
          <Trash2 className="size-5" />
        </button>
      </div>

      <div
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? setScale(1) : setScale(2.5))}
      >
        <img
          src={img.url}
          alt=""
          draggable={false}
          className="max-h-full max-w-full select-none object-contain transition-[transform] duration-75"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => onIndex(Math.max(0, index - 1))}
              disabled={index === 0}
              aria-label="Previous"
              className="absolute left-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-0"
            >
              <ChevronLeft className="size-6" />
            </button>
            <button
              type="button"
              onClick={() => onIndex(Math.min(images.length - 1, index + 1))}
              disabled={index >= images.length - 1}
              aria-label="Next"
              className="absolute right-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-0"
            >
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 px-4 py-4 text-white">
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Zoom out" className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <ZoomOut className="size-5" />
        </button>
        <span className="w-14 text-center text-sm tabular-nums text-white/80">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="Zoom in" className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <ZoomIn className="size-5" />
        </button>
      </div>
    </div>
  );
}
