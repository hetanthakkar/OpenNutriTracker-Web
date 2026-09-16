// Same-origin bootstrap for PaddleOCR's module worker. The cache bridge is a
// separate static dependency so it evaluates before the large worker entry;
// this keeps PaddleOCR's transport handler available immediately after Worker
// construction (unlike a top-level dynamic import).
import "./worker-fetch-cache.js";
import "./worker-entry-C9UNuyOJ.js?small-only=1";
