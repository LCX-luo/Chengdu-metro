# PDF.js browser dependencies

Version: 5.6.205, from `pdfjs-dist`.

Source: https://github.com/mozilla/pdf.js

`pdf.min.js` and `pdf.worker.min.js` are the matching upstream browser builds, copied without content modification; their extensions are renamed from `.mjs` to `.js` for Windows HTTP-server MIME compatibility. Both must be published together. License: Apache-2.0, in `LICENSE`.

Only text extraction is used, with JavaScript evaluation disabled. User-selected PDF bytes stay in browser memory.
