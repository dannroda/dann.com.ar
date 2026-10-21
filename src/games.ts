import { getCollection, type CollectionEntry } from 'astro:content';

export type Game = CollectionEntry<'store'> & { own?: CollectionEntry<'games'>['data'] };

export async function games() {
	const own = new Map((await getCollection('games')).map((g) => [g.id, g.data]));
	// shortcut: itch/steam ids grow over time, so id order ≈ release order; use real dates once the CMS stores them.
	const all: Game[] = (await getCollection('store'))
		.map((g) => ({ ...g, own: own.get(g.id) }))
		.filter((g) => !g.own?.hidden)
		.sort((a, b) => Number(!!b.own?.featured) - Number(!!a.own?.featured) || b.data.id - a.data.id);
	return {
		all,
		published: all.filter((g) => g.data.source === 'steam'),
		jams: all.filter((g) => g.data.source === 'itch' && g.data.jam),
		other: all.filter((g) => g.data.source === 'itch' && !g.data.jam)
	};
}

// itch "More information" rows are strings or string lists.
export const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : null);
