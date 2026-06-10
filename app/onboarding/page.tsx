import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { generateAvailableHandle, readOnboardingState } from "@/app/lib/onboarding/service";
import { logger } from "@/app/lib/logger";
import { CATEGORIES } from "@/lib/categories";
import { OnboardingWizard } from "./onboarding-wizard";

// First-run identity wizard. The gate is enforced by proxy.ts, but we ALSO read
// the state from the DB here — authoritative, so a stale 5-min cookie cache can
// never trap a just-finished user (it would otherwise loop / ↔ /onboarding).
export default async function OnboardingPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login?callbackUrl=%2Fonboarding");

  const state = await readOnboardingState({ userId: session.user.id });
  if (state?.onboardedAt) redirect("/");

  // Pre-fill the handle step with a generated suggestion so a user can simply
  // accept it — only when they haven't already claimed one. The gate funnels
  // every not-onboarded user HERE, so this page must render even if generation
  // fails (exhausted retries / transient DB error) — fall back to an empty input.
  let suggestedHandle: string | null = null;
  if (!state?.handle) {
    try {
      suggestedHandle = await generateAvailableHandle({ userId: session.user.id });
    } catch (e) {
      logger.error("onboarding.handle_suggestion_failed", { userId: session.user.id, err: String(e) });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <OnboardingWizard
        arenas={CATEGORIES}
        initialHandle={state?.handle ?? suggestedHandle ?? ""}
        displayName={session.user.name}
      />
    </main>
  );
}
