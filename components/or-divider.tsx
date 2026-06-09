/** "או" separator between the primary auth form and the OAuth option. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      או
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
