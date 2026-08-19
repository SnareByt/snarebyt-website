/**
 * Lets server-only modules be imported by a plain Node script.
 *
 * `server-only` throws on import outside a React Server Component, which is
 * exactly what protects secrets in the app — but it also means a CLI script
 * cannot import the licence renderer at all. Rather than weaken the guard in
 * the library, this intercepts the module for this one process, so the render
 * path exercised by the sample script is byte-for-byte the one production
 * uses.
 */
const Module = require('module');
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'server-only') return {};
  return load.call(this, request, parent, isMain);
};
