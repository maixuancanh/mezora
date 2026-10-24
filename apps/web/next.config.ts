import type { NextConfig } from 'next';
const config: NextConfig = {
 poweredByHeader: false,
 distDir:process.env.MEZORA_BUILD_DIR||'.next',
 serverExternalPackages:['@electric-sql/pglite','pg','pdfjs-dist','@napi-rs/canvas','tesseract.js','tesseract.js-core','sharp'],
 // OCR runs native packages in a bounded child Node process. Trace runtime
 // assets explicitly because the subprocess source is evaluated, not imported.
 outputFileTracingIncludes:{'/api/documents':[
  '../../node_modules/tesseract.js/**/*',
  '../../node_modules/tesseract.js-core/**/*',
  '../../node_modules/sharp/**/*',
  '../../node_modules/@img/**/*',
  '../../node_modules/@napi-rs/canvas*/**/*',
  '../../node_modules/pdfjs-dist/legacy/build/**/*',
  '../../node_modules/bmp-js/**/*',
  '../../node_modules/is-url/**/*',
  '../../node_modules/node-fetch/**/*',
  '../../node_modules/whatwg-url/**/*',
  '../../node_modules/tr46/**/*',
  '../../node_modules/webidl-conversions/**/*',
  '../../node_modules/regenerator-runtime/**/*',
  '../../node_modules/wasm-feature-detect/**/*',
  '../../node_modules/zlibjs/**/*',
  '../../node_modules/detect-libc/**/*',
  '../../node_modules/semver/**/*',
 ]},
};
export default config;
