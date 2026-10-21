import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';

// SITE/BASE_PATH come from the GitHub Pages workflow; locally the site runs at the root.
const base = process.env.BASE_PATH ?? '/';

// CMS uploads are referenced as "/media/x.png"; under a project-site base they need the prefix.
const prefixBase = {
	name: 'prefix-base',
	image(node, ctx) {
		if (node.url.startsWith('/')) ctx.setProperty(node, 'url', base.replace(/\/$/, '') + node.url);
	}
};

export default defineConfig({
	site: process.env.SITE ?? 'http://localhost:4321',
	base,
	trailingSlash: 'always',
	markdown: { processor: satteri({ mdastPlugins: [prefixBase] }) }
});
