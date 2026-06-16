/**
 * Shown when a coalition is the active context but the surface below reports
 * NATIONAL progress (season tiers, card unlocks). The sandbox invariant holds —
 * coalition picks never count toward global stats/cards/seasons — so we say so
 * plainly rather than letting a member assume their קואליציה picks count here.
 */
export function CoalitionScopeNote({ className }: { className?: string }) {
  return (
    <p className={`rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground ${className ?? ""}`}>
      התחזיות שלכם בקואליציה אינן נספרות כאן — דירוג העונה והקלפים נפתחים מתחזיות ארציות בלבד.
    </p>
  );
}
