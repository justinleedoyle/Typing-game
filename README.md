# The Portalwright's Almanac

A typing-adventure game for kids. Spiritual sequel to Touch Type Tale: medieval-fairy-tale storybook tone, hand-drawn art, narrator-led story, and a real touch-typing curriculum hidden inside a hub-and-portals adventure.

The full design plan lives in [`RESEARCH_AND_PLAN.md`](./RESEARCH_AND_PLAN.md).

## Stack

- **Phaser 3** + **TypeScript** + **Vite**
- **GitHub Pages** for static hosting
- **Supabase** for cloud saves (added in Phase 1)
- **ElevenLabs** for AI-generated narration (added in Phase 1)

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

## Project structure

```
src/
  main.ts               Phaser game bootstrap
  scenes/
    TitleScene.ts       Title screen + first keystroke handler
  audio/
    clack.ts            Synthesized typewriter clack (Web Audio)
.github/workflows/
  deploy.yml            Build + deploy to GitHub Pages on push to main
```
