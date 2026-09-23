// Browser-side pdf.js. Imported dynamically from client components only:
// pdf.js touches DOM globals at module load, so it must never run on the
// server. The worker is bundled from node_modules and served same-origin,
// which is what this site's `script-src 'self'` CSP (next.config.ts) requires.
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export { pdfjs };
