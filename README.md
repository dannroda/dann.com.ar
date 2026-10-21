# dann.com.ar

Personal site: portfolio, links and blog. Astro, deployed to GitHub Pages.

- `npm run dev`: local site at http://localhost:4321
- `/admin/`: Sveltia CMS. Online, "Sign In with Token" with a fine-grained GitHub token (Contents read/write on this repo); locally, `npm run dev` and "Work with Local Repository" in a Chromium browser
- `npm run sync`: pull game data from Steam, itch.io and Ludum Dare into `content/store/` and `public/games/` (the list lives in `content/sources.json`, editable in the CMS under Sitio › Juegos y proyectos; removing an entry removes its data)

Tasks live in `compass/` ([Scope Compass](https://github.com/dannroda/scope-compass)); readable export in `docs/tareas.md`.

The workflow in `.github/workflows/deploy.yml` syncs daily, commits any changes and redeploys.
