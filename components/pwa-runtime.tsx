"use client";

import { useEffect } from "react";
import { startPwaRuntime } from "@/lib/pwa";
import { syncPushSubscription } from "@/lib/notifications";
import { scheduleNutritionOcrAssetDownload } from "@/lib/nutrition-ocr-assets";

export function PwaRuntime() {
  useEffect(() => {
    const stop = startPwaRuntime();
    const stopNutritionOcrWarmup = scheduleNutritionOcrAssetDownload();
    void syncPushSubscription();
    return () => {
      stopNutritionOcrWarmup();
      stop();
    };
  }, []);

  return null;
}
