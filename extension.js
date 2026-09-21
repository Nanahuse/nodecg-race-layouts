/**
 * NodeCG extension entry point.
 *
 * NodeCG loads `extension.js` or `extension/index.js` from the bundle root. The
 * source lives in TypeScript under `src/extension/`; run `npm run build` to
 * emit `dist/extension/index.js` before starting NodeCG.
 */
module.exports = require("./dist/extension/index.js");
