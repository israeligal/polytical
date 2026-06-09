"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getPushStatus,
  subscribeToPush,
  unsubscribeFromPush,
  type PushStatus,
} from "@/lib/pwa/push-client";

interface UsePushSubscription {
  status: PushStatus;
  busy: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
}

/**
 * Drives the push opt-in surface. SSR / first paint reports "unsupported" (the
 * browser APIs are absent on the server); a mount effect resolves the real
 * status. `enable`/`disable` must be wired to a user gesture — they flip `busy`
 * around the round-trip and re-read the authoritative status afterwards.
 */
export function usePushSubscription(): UsePushSubscription {
  const [status, setStatus] = useState<PushStatus>("unsupported");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getPushStatus().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      setStatus(await getPushStatus());
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setStatus(await getPushStatus());
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable };
}
