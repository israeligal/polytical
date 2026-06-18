"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { USER_CARICATURE_PROMPT, GEMINI_APP_URL } from "@/lib/caricature-prompt";
import { fileToSquareDataUrl } from "@/lib/image-normalize";
import {
  setCaricatureAction as defaultSetCaricatureAction,
  clearCaricatureAction as defaultClearCaricatureAction,
} from "@/app/actions/caricature";

/**
 * Bring-your-own caricature-avatar editor. Gemini can't be opened pre-filled
 * (no URL prompt param, no auto-attach), so the flow is: copy the prompt → open
 * Gemini in a new tab → user generates with their own photo → download/copy →
 * upload here. The image is center-cropped + downscaled client-side before it's
 * sent to `setCaricatureAction` as a data URL.
 *
 * Used on /profile (collapsed trigger, refreshes on save) and as an onboarding
 * step (`defaultEditing`, `onSaved` advances the wizard instead of refreshing —
 * a router.refresh() would remount the wizard and lose its state). Actions are
 * injectable (`_`-prefixed) for Storybook/tests, mirroring ChangeHandleForm.
 */
export type CaricatureEditorProps = {
  currentCaricatureUrl?: string | null;
  defaultEditing?: boolean;
  onSaved?: () => void;
  _setCaricatureAction?: typeof defaultSetCaricatureAction;
  _clearCaricatureAction?: typeof defaultClearCaricatureAction;
};

export function CaricatureEditor({
  currentCaricatureUrl = null,
  defaultEditing = false,
  onSaved,
  _setCaricatureAction = defaultSetCaricatureAction,
  _clearCaricatureAction = defaultClearCaricatureAction,
}: CaricatureEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(defaultEditing);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<string | null>(null); // normalized data URL, ready to save
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  function afterMutation() {
    setPreview(null);
    setError(null);
    if (!defaultEditing) setEditing(false);
    if (onSaved) onSaved();
    else router.refresh(); // re-render the RSC header + profile with the new avatar
  }

  function copyPrompt() {
    void navigator.clipboard?.writeText(USER_CARICATURE_PROMPT).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => setError("ההעתקה נכשלה — סמנו והעתיקו ידנית"),
    );
  }

  async function ingestFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("בחרו קובץ תמונה");
      return;
    }
    setError(null);
    setProcessing(true);
    try {
      setPreview(await fileToSquareDataUrl({ file }));
    } catch {
      setError("לא הצלחנו לעבד את התמונה — נסו קובץ אחר");
    } finally {
      setProcessing(false);
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      void ingestFile(file);
    }
  }

  function save() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await _setCaricatureAction({ dataUrl: preview });
      if (res.ok) afterMutation();
      else setError(res.message ?? "אירעה שגיאה");
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await _clearCaricatureAction();
      if (res.ok) afterMutation();
      else setError(res.message ?? "אירעה שגיאה");
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
      >
        {currentCaricatureUrl ? "ערכו אווטאר" : "הוסיפו אווטאר קריקטורה"}
      </button>
    );
  }

  const shownPreview = preview ?? currentCaricatureUrl;

  return (
    <div className="mt-3 max-w-md rounded-[14px] border border-border bg-sunken p-4" onPaste={onPaste}>
      <h3 className="font-display text-lg text-foreground">אווטאר קריקטורה</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        ציירו את עצמכם בעזרת Gemini והעלו את התוצאה — היא תהפוך לתמונת הפרופיל שלכם בכל מקום.
      </p>

      {/* Step 1 — generate in Gemini */}
      <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm text-foreground">
        <li>העתיקו את ההנחיה ופתחו את Gemini</li>
        <li>הדביקו את ההנחיה וצרפו תמונה שלכם</li>
        <li>צרו את הקריקטורה והורידו (או העתיקו) אותה</li>
        <li>העלו אותה כאן למטה</li>
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copyPrompt}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-bold text-foreground transition-colors hover:border-primary"
        >
          {copied ? "ההנחיה הועתקה ✓" : "📋 העתיקו הנחיה"}
        </button>
        <a
          href={GEMINI_APP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          פתחו את Gemini ↗
        </a>
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">
          הצגת ההנחיה
        </summary>
        <p dir="ltr" className="mt-1 whitespace-pre-wrap rounded-lg bg-card p-2 text-start text-xs text-muted-foreground">
          {USER_CARICATURE_PROMPT}
        </p>
      </details>

      {/* Step 2 — upload the result */}
      <div className="mt-4 flex items-center gap-4">
        {shownPreview ? (
          // Local preview / current avatar — a plain img (data URL, not optimized).
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shownPreview}
            alt=""
            aria-hidden="true"
            className="h-20 w-20 shrink-0 rounded-full object-cover ring-1 ring-border"
          />
        ) : (
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-muted text-2xl ring-1 ring-border">
            🎨
          </div>
        )}
        <div className="min-w-0">
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void ingestFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={processing || pending}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition-colors hover:border-primary disabled:opacity-50"
          >
            {processing ? "מעבד…" : shownPreview ? "בחרו תמונה אחרת" : "בחרו תמונה"}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">או הדביקו תמונה (Ctrl/⌘+V)</p>
        </div>
      </div>

      {error && <p className="mt-2 text-sm font-semibold text-negative">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!preview || processing || pending}
          className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          {pending ? "שומר…" : "שמרו אווטאר"}
        </button>
        {currentCaricatureUrl && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-full border border-border px-5 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
          >
            הסירו אווטאר
          </button>
        )}
        {!defaultEditing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setPreview(null);
              setError(null);
            }}
            disabled={pending}
            className="rounded-full border border-border px-5 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            סגירה
          </button>
        )}
      </div>
    </div>
  );
}
