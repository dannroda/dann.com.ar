import { getCollection, type CollectionEntry } from 'astro:content';

export type Game = CollectionEntry<'store'> & { own?: CollectionEntry<'games'>['data'] };

export async function games() {
	const own = new Map((await getCollection('games')).map((g) => [g.id, g.data]));
	// shortcut: itch/steam ids grow over time, so id order ≈ release order; use real dates once the CMS stores them.
	const all: Game[] = (await getCollection('store'))
		.map((g) => ({ ...g, own: own.get(g.id) }))
		.filter((g) => !g.own?.hidden)
		// A repo already linked from another game's page is not listed again as a project.
		.filter((g, _, all) => g.data.source !== 'github' || !all.some((o) => repoOf(o) && `https://github.com/${repoOf(o)}` === g.data.url.toLowerCase()))
		.sort((a, b) => Number(!!b.own?.featured) - Number(!!a.own?.featured) || b.data.id - a.data.id);
	// Vibe-coded work only shows in the Lab, whatever its source.
	const lab = all.filter((g) => g.own?.ai === 'vibe');
	const rest = all.filter((g) => g.own?.ai !== 'vibe');
	return {
		all,
		lab,
		published: rest.filter((g) => g.data.source === 'steam'),
		jams: rest.filter((g) => g.data.source === 'itch' && g.data.jam),
		other: rest.filter((g) => g.data.source === 'itch' && !g.data.jam),
		projects: rest.filter((g) => g.data.source === 'github' || g.data.source === 'assetlib')
	};
}

export const repoOf = (g: Game) => g.data.repo?.toLowerCase() || null;

// GitHub's generated preview: 2:1 with the repo name on its left, so it is cropped from that side.
export const isCard = (g: Game) => !!g.data.images?.cover?.startsWith('https://opengraph.githubassets.com/');

export const storeName = { steam: 'Steam', itch: 'itch.io', github: 'GitHub', assetlib: 'Asset Library' } as const;

// itch "More information" rows are strings or string lists.
export const list = (v: unknown) => (Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : null);
