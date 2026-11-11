# The Portalwright's Almanac

A typing-adventure game for kids. Spiritual sequel to Touch Type Tale: medieval-fairy-tale storybook tone, hand-drawn art, narrator-led story, and a real touch-typing curriculum hidden inside a hub-and-portals adventure.

The full design plan lives in [`RESEARCH_AND_PLAN.md`](./RESEARCH_AND_PLAN.md).

## Stack

- **Phaser 3** + **TypeScript** + **Vite**
- **GitHub Pages** for static hosting
- **Supabase** (Postgres + Auth) for cross-device cloud saves
- **ElevenLabs** for AI-generated narration (added in a later phase)

## Develop

```sh
npm install
npm run dev
```

The dev server prints a local URL (default `http://localhost:5173`). Open it and you should see the title screen; pressing any key plays a typewriter clack.

```sh
npm run build       # type-check + production build into dist/
npm run preview     # serve the production build locally
npm run typecheck   # type-check only
```

## Deploy

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`. The live URL is `https://justinleedoyle.github.io/Typing-game/`.

**One-time repo setup** (do this in the GitHub UI before the first push to `main`):

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Confirm **Settings → Actions → General → Workflow permissions** is set to *Read and write permissions*.

After that, every push to `main` triggers the workflow and the new build is live in ~1–2 minutes.

If you fork or rename the repo, update `base` in `vite.config.ts` to match the new repo name.

## Cloud save setup

The game saves to `localStorage` out of the box; that's enough for one-device play. Cross-device sync runs through Supabase. The project URL and publishable key are already in [`src/config.ts`](./src/config.ts) (both are safe to commit — Row Level Security on the `player_saves` table is what protects player data).

Two pieces of one-time external setup turn on Google sign-in:

### 1. Apply the schema migration

The repo's GitHub integration with Supabase auto-applies SQL files under `supabase/migrations/` on every push to `main`. So the first push that includes `supabase/migrations/20260512000000_player_saves.sql` will create the `player_saves` table and its RLS policies.

If for some reason it doesn't auto-apply, you can paste the migration into **Supabase Dashboard → SQL Editor → New query** and run it manually.

### 2. Configure Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Create (or pick) a project, then **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized redirect URIs**: add
   ```
   https://sdmbmwulutbyhxhueuia.supabase.co/auth/v1/callback
   ```
4. Save and copy the **Client ID** and **Client Secret**.

In the Supabase dashboard:

1. **Authentication → Providers → Google**: toggle on, paste Client ID + Client Secret, save.
2. **Authentication → URL Configuration**:
   - **Site URL**: `https://justinleedoyle.github.io/Typing-game/`
   - **Redirect URLs** (add both):
     - `https://justinleedoyle.github.io/Typing-game/`
     - `http://localhost:5173/Typing-game/`

After that, typing `sign in` in the Portal Chamber redirects Aiden to Google, then back to the game with a synced cloud save.

## Project structure

```
src/
  main.ts                       Phaser game bootstrap
  config.ts                     Supabase URL + publishable key (both public)
  audio/                        Web Audio SFX
  game/                         Save state, typing input, palette, lore
    saveState.ts                  Local + cloud + composite save backends
    supabaseClient.ts             Supabase client + auth helpers
    typingInput.ts                First-letter-lock typing controller
    wordTarget.ts                 Typeable word UI primitive
    palette.ts                    Storybook color tokens
    relics.ts                     Per-realm souvenir registry
    realmLore.ts                  Per-realm Almanac prose
  scenes/
    TitleScene.ts                 Title screen + save-loading
    PortalChamberScene.ts         Hub: typewriter, portals, satchel, auth
    WinterMountainScene.ts        First realm: wolves, CYOA, ending
    AlmanacScene.ts               Two-page book view of cleared realms
supabase/
  migrations/                   SQL files auto-applied on push to main
.github/workflows/
  deploy.yml                    Build + deploy to GitHub Pages on push to main
```


## Desktop builds (internal review)

Use Node24 (minimum22.12). `npm ci` installs the pinned tooling. The web build remains `npm run build`.

- `npm run desktop:start` builds and opens the offline desktop edition. Electron45 downloads its runtime through the explicit `desktop:runtime` step.
- `npm run desktop:pack -- --win --x64` creates `release/win-unpacked/Portalwrights Almanac.exe` on a Windows build host.
- `npm run desktop:win` creates a Windows x64 ZIP for internal distribution. The whole unpacked folder belongs together; the EXE alone is not a distributable game.
- `npm run desktop:pack -- --mac --arm64` creates the unsigned local Mac review app.
- `node scripts/desktop-smoke.mjs --executable "release/win-unpacked/Portalwrights Almanac.exe" --output artifacts/desktop-smoke` runs disposable packaged Windows startup, fonts, synthetic keyboard pause/resume, normal close, relaunch and forced-termination checks. GitHub's Windows desktop workflow runs this against the actual executable and retains reports/screenshots.

Desktop is an offline guest edition. It bundles its artwork, four Source Serif4 font faces and their OFL license; it does not open Google sign-in or make network requests. Browser/cloud data remains separate. Steam services remain separate from the desktop wrapper.

To move browser progress, return to the title and choose **Move a journey · T**, then **Save a journey file · E**. Check that your browser downloaded the JSON file. In the desktop game, choose **Move a journey · T → Choose a journey file · I**, review both journeys, and explicitly choose **Import this journey · I**. Cancelling does not replace progress. Existing desktop data is archived before replacement; the source file and browser journey stay unchanged. Only playable journey exports are accepted; raw recovery files, newer formats, damaged files and unresolved save choices are refused. Native desktop export also lets you save a portable copy of the current journey. Offline guest import never writes an account or cloud save.

Saves live under the OS user-data folder (`%APPDATA%/Portalwrights Almanac/journeys` on Windows), outside the install directory. The game reuses save validation, backups, conflicting-journey choices and unreadable-data recovery. Main-process writes flush a temporary file before atomic replacement. Normal close freezes gameplay and drains the current autosave; forced termination restores acknowledged progress, not every unflushed keystroke. Real Windows power-loss and physical keyboard/layout behavior still need target testing.

The renderer has no Node access, uses a local custom protocol, rejects external navigation/network requests and exposes only scoped save operations. F11 toggles fullscreen; the native application menu is removed so Alt remains available to gameplay. Non-US AltGr/dead-key/IME behavior remains unverified. Packages are unsigned internal builds; no Steam submission, code signing or deployment is performed by these commands.
