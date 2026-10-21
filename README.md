# dann.com.ar

Personal site: portfolio, links and blog. Astro, deployed to GitHub Pages.

- `npm run dev`: local site at http://localhost:4321
- `npm run sync`: pull game data from Steam, itch.io and Ludum Dare into `content/store/` and `public/games/` (games are listed in `content/sources.json`)

Tasks live in `compass/` ([Scope Compass](https://github.com/dannroda/scope-compass)); readable export in `docs/tareas.md`.

The workflow in `.github/workflows/deploy.yml` syncs daily, commits any changes and redeploys.
