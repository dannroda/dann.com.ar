import { defineConfig } from 'astro/config';

// SITE/BASE_PATH come from the GitHub Pages workflow; locally the site runs at the root.
export default defineConfig({
	site: process.env.SITE ?? 'http://localhost:4321',
	base: process.env.BASE_PATH ?? '/',
	trailingSlash: 'always'
});
