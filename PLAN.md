# Birthday Map Website Plan

## Summary

- Build a sketch-style China memory map frontend.
- Keep the frontend deployable on GitHub Pages.
- Move secure password verification and signed image delivery to a real backend.
- Use Alibaba Cloud Function Compute + OSS for production-grade protected photo access.

## Implementation

- Add `src/config.js` for the site title, API base URL, and UI copy.
- Render a real province-outline SVG map from `src/china-provinces.geojson`.
- Detect photo availability through a backend API instead of public frontend file probing.
- On province click, open a password prompt and ask the backend for a short-lived image URL.
- Support local development with `server.js` and production deployment with Alibaba Cloud Function Compute.
- Keep province names out of the map itself to preserve a cleaner sketch-style composition.

## Local Debugging

- Use `npm install` first.
- Use `npm run dev` to start the local server.
- Open `http://localhost:4000`.

## Production Architecture

- GitHub Pages hosts the static frontend.
- Alibaba Cloud OSS stores private images.
- Alibaba Cloud Function Compute verifies passcodes and returns short-lived signed URLs.
- `src/config.js` points the frontend to the Function Compute public URL.

## Update Log

### 2026-03-19 - Province Shape + Sketch UI Pass

- Replaced the old rectangular province cartogram with real China province outlines.
- Shifted the visual language to a paper-and-ink sketch style.
- Fixed the default Chinese copy that had encoding damage.

### 2026-03-19 - Interaction + Mobile Cleanup Pass

- Added a persistent update summary section to this file so each meaningful change is recorded.
- Removed province names from the map because they crowded small regions and hurt the composition.
- Disabled pointer interaction for provinces without photos to avoid the black-box/focus artifact on click or tap.
- Tuned the map container and CSS for smaller screens and broader browser behavior, including iOS-friendly scrolling and text sizing.

### 2026-03-19 - Verification Follow-up

- Restarted the local server successfully at `http://localhost:4000` after the earlier port conflict was cleared.
- Re-ran syntax checks for `src/app.js`, `src/config.js`, and `src/province-data.js` successfully.
- Left the running status documented here so future updates keep a lightweight verification trail.

### 2026-03-19 - Title and Copy Simplification

- Confirmed that `src/config.js` is the source of truth for the page title because `src/app.js` overwrites `index.html` text on load.
- Updated the configured title to `Memories of 🦊 and 🐱` so it now appears in both the hero heading and the browser tab.
- Simplified the default UI copy to single-language labels instead of duplicating every string in Chinese and English.

### 2026-03-19 - Hero Title Layout Tweak

- Adjusted the hero title CSS so the site title stays on one line instead of wrapping under the earlier width constraint.
- Reduced the title size a bit on smaller breakpoints to preserve the one-line layout on narrower screens.

### 2026-03-19 - Legend Restored

- Added the legend back to the map header.
- Renamed the two legend states to `Unlocked` and `Locked`.
- Kept the legend text wired through `src/config.js` so it remains easy to edit later.

### 2026-03-19 - Background Hotspot Softened

- Reduced the intensity of the bright warm glow in the upper-left page background.
- Softened the white highlight overlay so the corner feels calmer while keeping the paper-like atmosphere.

### 2026-03-19 - Password Reset on Reload

- Removed the saved unlock state so refreshing the page always returns to the password screen.
- Kept the behavior fully client-side without cookies or storage-based remember logic.
- Cleared the password input and hidden error state whenever the gate is reset.

### 2026-03-19 - Local Backup Snapshot

- Initialized a local git repository for this project.
- Created a restore-point commit so we can safely experiment with the next architecture change.
- Current snapshot commit: `c2f5519` (`Backup current photo map version`).

### 2026-03-19 - Server-side Photo Access Architecture

- Removed the full-page frontend password gate and switched to province-level password prompts.
- Added backend APIs for available-photo discovery and password-verified image access.
- Blocked direct public access to local `photos/` files and moved image delivery behind short-lived server-generated links.
- Added Alibaba Cloud OSS configuration scaffolding, manifest templates, and dependency wiring for signed URL generation.

### 2026-03-20 - Local Run Setup Completed

- Created a local `.env` in `PHOTO_SOURCE=local` mode.
- Installed project dependencies successfully.
- Fixed `server.js` so it actually loads `.env` during local startup.
- Verified the full local chain: available provinces API, password verification, short-lived image URL generation, and image fetch all succeeded.
- Local test password currently set to `foxcat-local-pass`.

### 2026-03-20 - GitHub Pages + Alibaba Cloud Split Prepared

- Added `apiBaseUrl` support so the frontend can call an external backend while still being hosted statically.
- Updated the frontend fetch flow to work with absolute API origins and signed image URLs.
- Added an Alibaba Cloud Function Compute backend example under `aliyun/fc/`.
- Documented the intended GitHub Pages + Function Compute + OSS deployment flow in `README.md`.

### 2026-03-20 - Function Upload Package Ready

- Installed the Function Compute backend dependencies inside `aliyun/fc`.
- Built an uploadable package at `dist/aliyun-fc-upload.zip`.
- Confirmed the package includes the function entry files and dependencies needed for deployment.

### 2026-03-20 - Function Package Simplified

- Rewrote the Function Compute backend to use native Node HTTP handling instead of `express`.
- Removed the `express` dependency to avoid module-resolution issues in the FC runtime.
- Rebuilt `dist/aliyun-fc-upload.zip` as a leaner replacement upload package.

### 2026-03-20 - Function Package Bundled

- Bundled the Function Compute backend into a single `bundle.mjs` file.
- Rebuilt `dist/aliyun-fc-upload.zip` so deployment no longer depends on FC resolving runtime `node_modules`.
- The new upload package now contains only `bundle.mjs` and a minimal `package.json`.

### 2026-03-20 - Function Package Switched To CommonJS

- Rebuilt the bundled Function Compute backend as `bundle.cjs` instead of ESM.
- This avoids `dynamic require` failures inside the `ali-oss` dependency chain.
- Rebuilt `dist/aliyun-fc-upload.zip` again for the new CommonJS startup flow.

### 2026-03-20 - Alibaba Function Connected

- Confirmed the Function Compute root endpoint and `/api/photos/available` endpoint are working.
- Updated the frontend `apiBaseUrl` to point at the live Alibaba Cloud function domain.
- The frontend is now ready to call the production photo API after you publish the static files.

### 2026-03-20 - GitHub Pages Publishing Readiness Pass

- Rechecked the frontend files end to end before GitHub publishing.
- Cleaned `index.html` fallback text so the initial HTML no longer shows mojibake before `src/config.js` hydrates the page copy.
- Updated `README.md` so the Alibaba Function Compute deployment steps match the current bundled upload flow with `dist/aliyun-fc-upload.zip` and `node bundle.cjs`.
- Added a root `.nojekyll` file so GitHub Pages serves the static site directly without Jekyll trying to process it.

### 2026-03-20 - Photo History Removed From Git

- Rewrote the local git history so `photos/` is no longer part of the tracked repository history that will be pushed.
- Added `photos/` to `.gitignore` to keep the local image folder out of future commits.

## Notes

- GitHub Pages is only for the frontend.
- Secure password validation must live in Function Compute or another real backend.

### 2026-03-20 - Frontend Startup Resilience Fix

- Decoupled map GeoJSON loading from photo-availability discovery.
- The China map now renders even if the remote photo API or CORS setup is temporarily failing.
- When the backend call fails, the page falls back to an all-locked map instead of showing `Map data failed to load.` for the entire site.

### 2026-03-20 - Map Data Embedded For GitHub Pages

- Stopped fetching `src/china-provinces.geojson` at runtime on the frontend.
- Generated `src/china-geo-data.js` so the province geometry now ships as a JS module with the site.
- This removes a likely GitHub Pages static-file failure point and makes map rendering more reliable after deployment.

### 2026-03-20 - Map Data Source Repaired

- Replaced the broken province GeoJSON with a clean parseable China map dataset.
- Added `src/china-geo-data.js` as the frontend-loaded geometry module.
- Normalized province feature IDs so the new map source still matches the existing province metadata and photo slugs.

### 2026-03-20 - Per-Province Passcode Support Completed

- Kept Alibaba Function Compute on the existing `PHOTO_PASSCODE_MAP_JSON` flow for per-province passwords.
- Updated the local `server.js` backend to support per-province passcodes too, via either `PHOTO_PASSCODE_MAP_JSON` or `PHOTO_PASSCODE_MAP_PATH`.
- Added [photo-passcodes.example.json](/e:/他人物品/260321/repo/photo-passcodes.example.json) and expanded the README and `.env.example` so the configuration is easier to follow.

### 2026-03-20 - Guess-The-Place UI Polish

- Reworded the province prompt flow around guessing the place of the memory instead of entering a generic password.
- Removed the visible `CHINA` label above the map.
- Changed the photo frame so the black outline now hugs the displayed image instead of forcing a large fixed box with empty space.

### 2026-03-20 - Photo Frame Tightened Further

- Switched the viewer photo frame to an inline-block shrink-wrap layout.
- Made the image fill the frame width so the stray right-side white strip is removed.

### 2026-03-20 - Hero Title Size Reduced

- Reduced the main `Memories of ...` title scale slightly across desktop and mobile breakpoints.
- Kept the single-line treatment while making the heading feel less oversized.


### 2026-03-20 - Frontend Cache Busting Added

- Added explicit version query strings to the published CSS and JS entry points.
- Versioned the `src/app.js` module imports too, so updated config and map modules are forced to refresh instead of serving stale browser cache.

### 2026-03-20 - Hero And Map Title Font Unified

- Switched the `Memories of ...` hero line and the map subtitle line back to the body font family.
- Kept the sketch display font on the viewer and dialog headings only.

### 2026-03-20 - Hero Title Centered And Reduced Again

- Center-aligned the main `Memories of ...` heading within the hero area.
- Reduced the title scale another step across desktop and mobile breakpoints.
