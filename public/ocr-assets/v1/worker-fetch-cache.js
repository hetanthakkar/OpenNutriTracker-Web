// Let PaddleOCR's dedicated worker reuse model archives warmed by the page.
// Cache Storage is best-effort; browsers that deny it simply use networkFetch.
const MODEL_PREFIX = `${self.location.origin}/ocr-assets/v1/models/`;
const MODEL_CACHE_NAME = "nutritracker-ocr-models-v1";
const networkFetch = globalThis.fetch.bind(globalThis);

if (typeof caches !== "undefined") {
  const cachePromise = caches.open(MODEL_CACHE_NAME).catch(() => null);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    if (!request.url.startsWith(MODEL_PREFIX)) return networkFetch(input, init);

    const cache = await cachePromise;
    if (cache) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    const response = await networkFetch(request);
    if (cache && response.ok) void cache.put(request, response.clone()).catch(() => {});
    return response;
  };
}
