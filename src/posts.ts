import { getCollection } from 'astro:content';
import type { Lang } from './i18n';

// Drafts show up in `npm run dev` only.
export async function posts(lang: Lang) {
	return (await getCollection('blog', (p) => p.id.startsWith(`${lang}/`) && (import.meta.env.DEV || !p.data.draft))).sort(
		(a, b) => b.data.date.getTime() - a.data.date.getTime()
	);
}

export const slugOf = (id: string) => id.split('/').slice(1).join('/');
