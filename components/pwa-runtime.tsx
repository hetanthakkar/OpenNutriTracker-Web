"use client";

import { useEffect } from "react";
import { startPwaRuntime } from "@/lib/pwa";
import { syncPushSubscription } from "@/lib/notifications";

export function PwaRuntime() {
  useEffect(() => {
    const stop = startPwaRuntime();
    void syncPushSubscription();
    return stop;
  }, []);

  return null;
}
