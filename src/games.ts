import { getCollection, type CollectionEntry } from 'astro:content';

export type Game = CollectionEntry<'store'>;

export async function games() {
	// shortcut: itch/steam ids grow over time, so id order ≈ release order; use real dates once the CMS stores them.
	const all = (await getCollection('store')).sort((a, b) => b.data.id - a.data.id);
	return {
		all,
		published: all.filter((g) => g.data.source === 'steam'),
		jams: all.filter((g) => g.data.source === 'itch' && g.data.jam),
		other: all.filter((g) => g.data.source === 'itch' && !g.data.jam)
	};
}

// itch "More information" rows are strings or string lists.
export const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : null);
