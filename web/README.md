# web (GW-CRM browser client package)

## Overview

A separate Vite + React 18 + TypeScript package (`gigworks-crm-web`, own
`package.json` and lockfile) that builds the GW-CRM single-page app. In
development, Vite serves the app on port 5173 and proxies `/api` to the API
server on `http://localhost:3000`, so the session cookie stays first-party as
it is in production, where one server serves both. `index.html` loads
`/src/main.tsx` into `#root`.

## Interface

- `vite.config.ts`: default `defineConfig` with `@vitejs/plugin-react`, `server.port: 5173`, `server.proxy['/api'] = 'http://localhost:3000'`, `build.outDir: 'dist'`, `build.sourcemap: false`, and `test.include: ['src/**/*.test.ts']` with `environment: 'node'`.
- `package.json` scripts: `dev` (`vite`), `build` (`tsc --noEmit && vite build`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`).
- `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noEmit`, `jsx: react-jsx`, `moduleResolution: Bundler`; includes `src` and `vite.config.ts`.
- [src](./src/README.md): all app source. It contains the `App` shell and hash routing, the `api()` client and `ApiError`, shared types, the pages and components (pipeline, contacts, follow-ups, templates, links, calendar, email, money, public subscribe and unsubscribe), and pure formatting helpers.

## Invariants

- The client talks to the server only through relative `/api/*` URLs. Dev relies on the Vite proxy; production relies on same-origin serving.
- `vite build` runs only after `tsc --noEmit` passes.
- Tests are pure-logic tests in the Node environment (no DOM). Only `src/**/*.test.ts` files are collected.
- Build output goes to `web/dist`, without source maps.

## Side Effects

- `npm run dev` starts a dev server on port 5173 that forwards `/api` requests to `localhost:3000`.
- `npm run build` writes `web/dist`.
- Runtime side effects (network, clipboard, OAuth redirect, CSV download) are described in [src](./src/README.md).

## Verification

- Prerequisite: `npm --prefix web install` (the package has its own dependencies; without `web/node_modules`, vitest fails to load `vite.config.ts` because it cannot find `@vitejs/plugin-react`)
- Run: `npm --prefix web test`
- Typecheck: `npm --prefix web run typecheck`
