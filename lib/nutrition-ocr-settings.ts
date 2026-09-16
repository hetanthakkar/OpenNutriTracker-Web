export function nutritionOcrSettings(mobile: boolean) {
  const maxSide = mobile ? 960 : 2_000;
  return {
    // PaddleOCR 0.4.2's pipeline defaults to "min". Setting only the side
    // length would UPSCALE every camera frame (including small panel crops).
    textDetLimitType: "max" as const,
    textDetLimitSideLen: maxSide,
    textDetMaxSideLimit: maxSide,
    textRecognitionBatchSize: mobile ? 1 : 8,
  };
}
