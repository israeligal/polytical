/**
 * Storybook stub for `app/actions/faucet.ts`.
 *
 * The real Server Action transitively imports the DB client, Better Auth, and
 * the ledger service — none of which can run in Storybook's browser bundle.
 * We alias only this external boundary (via `.storybook/main.ts`) so the real
 * `FaucetButton` component is still exercised. The story drives the two
 * outcomes by toggling `__faucetMock`.
 */
type FaucetResult = { ok: boolean; message?: string; streak?: number; amount?: number };

export const __faucetMock: { result: FaucetResult; delayMs: number } = {
  result: { ok: true, streak: 1, amount: 200 },
  delayMs: 600,
};

export async function claimFaucetAction(): Promise<FaucetResult> {
  await new Promise((resolve) => setTimeout(resolve, __faucetMock.delayMs));
  return __faucetMock.result;
}
