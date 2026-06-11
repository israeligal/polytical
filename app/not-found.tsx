import Link from "next/link";

// Hebrew RTL 404. Renders inside RootLayout, so dir/fonts/SiteHeader are
// inherited — replaces Next's off-brand English default for any notFound()
// (bad /market/<id> or /politician/<id>) or unknown URL.
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-bold text-primary">404</p>
      <h1 className="mt-2 font-display text-4xl font-black text-foreground sm:text-5xl">
        הדף לא נמצא
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        הקלף או התחזית שחיפשתם לא קיימים — אולי הקישור שגוי או שהתחזית הוסרה.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          חזרה לתחזיות
        </Link>
        <Link
          href="/politicians"
          className="rounded-lg border-2 border-primary px-5 py-3 font-bold text-primary transition-colors hover:bg-primary/5"
        >
          לכל הפוליטיקאים
        </Link>
      </div>
    </main>
  );
}
