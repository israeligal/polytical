import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { readOnboardingState } from "@/app/lib/onboarding/service";
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

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <OnboardingWizard
        arenas={CATEGORIES}
        initialHandle={state?.handle ?? ""}
        displayName={session.user.name}
      />
    </main>
  );
}
