import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { posts, slugOf } from '../../posts';
import { t, url, langPaths, type Lang } from '../../i18n';

export const getStaticPaths = langPaths;

export async function GET({ params, site }: APIContext) {
	const lang = params.lang as Lang;
	return rss({
		title: `dann · ${t[lang].blog}`,
		description: t[lang].tagline,
		site: new URL(url(`/${lang}/`), site),
		items: (await posts(lang))
			.filter((p) => !p.data.draft)
			.map((p) => ({
				title: p.data.title,
				pubDate: p.data.date,
				description: p.data.description,
				categories: p.data.tags,
				link: url(`/${lang}/blog/${slugOf(p.id)}/`)
			})),
		customData: `<language>${lang}</language>`
	});
}
