---
Task ID: 1
Agent: Main Agent
Task: Convert NutriLabel from server-dependent to fully client-side standalone app

Work Log:
- Read all existing project files to understand current architecture
- Created `src/lib/storage.ts` - IndexedDB storage layer replacing Prisma/SQLite
  - CRUD operations for recipes and ingredients using `idb` library
  - API key stored in localStorage
  - All data persists in browser's IndexedDB
- Created `src/lib/fda-client.ts` - Client-side FDA FoodData Central API search
  - Direct browser-to-FDA API calls (no server proxy needed)
  - Same normalization logic (Branded→per100g, Foundation already per100g)
  - Falls back to built-in food database on API failure
- Rewrote `src/lib/recipe-store.ts` - Zustand store
  - Replaced all `fetch('/api/...')` calls with IndexedDB operations
  - Added unit conversion (g, oz, lb, cup, tbsp, tsp, ml, whole → grams)
  - Client-side nutrient scaling (per 100g → actual amount)
  - Added `setApiKey` and `loadApiKey` methods for API key management
- Rewrote `src/app/page.tsx` - Main page
  - Added Settings dialog with API key configuration
  - Shows "Local Storage" and "API Key Set" status badges in header
  - Removed PWA install prompt (not needed for Tauri/Capacitor approach)
  - Updated footer to say "100% local, no server required"
- Updated `next.config.ts` - Static export configuration
  - `output: 'export'` for Tauri/Capacitor (commented out during dev)
  - `images.unoptimized: true` for static export compatibility
- Simplified `src-tauri/` - No sidecar server
  - Removed all server process management from `lib.rs`
  - Simple Tauri shell that loads static files from `../out`
  - Removed `tokio`, `reqwest`, `dirs`, `which` Rust dependencies
  - Updated `tauri.conf.json` to point `frontendDist` to `../out`
  - Removed sidecar server resource bundling
- Added Capacitor configuration for mobile
  - Installed `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`, `@capacitor/ios`
  - Created `capacitor.config.ts` pointing to `out/` directory
  - Added build scripts: `cap:init`, `cap:add:android`, `cap:add:ios`, `cap:sync`, etc.
- Updated `package.json`
  - Name: `nutrilabel`, version: `1.0.0`
  - Simplified scripts (removed DB scripts, added Tauri/Capacitor scripts)
- Generated app icons for PWA manifest and Tauri
- Updated `src/app/layout.tsx` - Removed service worker registration
- Deleted `src/components/pwa-install-prompt.tsx` (no longer needed)
- ESLint passes clean

Stage Summary:
- App is now 100% client-side: no server, no hosting, no database server needed
- All recipe data stored in browser IndexedDB
- FDA API calls made directly from the browser
- API key managed through Settings dialog in the app UI
- Static export (`next build` → `out/`) for Tauri desktop and Capacitor mobile
- Tauri desktop: loads static files, no Node.js runtime required
- Capacitor mobile: wraps static files in native Android/iOS shell
- 40-food fallback database for offline/rate-limited scenarios
