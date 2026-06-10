"use client";

import { useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * False during SSR + the hydration render, true afterwards — the sanctioned
 * gate for browser-clock/timezone-dependent values (e.g. `datetime-local`
 * mins/prefills) that would otherwise SSR with the server's timezone and trip
 * a hydration mismatch. Derive from it inline; don't mirror into state.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, clientSnapshot, serverSnapshot);
}
