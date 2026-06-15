// Short point-form "what is a coalition" card. Shared by /g/new, the empty /g
// list, and the homepage discovery section so the explanation never drifts.
const POINTS = [
  "🗳️ הצעות לסדר משלכם — כל חבר מעלה, כולם מנבאים",
  "🏆 לוח תוצאות נפרד — מי הכי מדייק בקבוצה",
  "💬 מליאה — דיון על כל הצעה",
  "🔒 פרטי: רק חברים רואים את ההצעות, התוצאות והדיון",
  "🔗 מצטרפים בהזמנה בלבד",
  "🤝 שיתוף עמדות הכנסת — רק אם תבחרו, וגם אז רק בין חברים",
];

export function CoalitionExplainer({
  heading = "מה זו קואליציה?",
  className,
}: {
  heading?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 text-sm shadow-sm ${className ?? ""}`}>
      <h2 className="mb-2 font-display text-base font-bold text-foreground">{heading}</h2>
      <ul className="space-y-1.5 text-muted-foreground">
        {POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
