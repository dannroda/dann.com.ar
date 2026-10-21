// Pulls store data (Steam, itch.io) into content/store/<slug>.json and images into public/games/<slug>/.
// Only store-owned fields live here; your own fields (AI label, authorship, texts) go in separate files the sync never touches.
// Usage: node scripts/sync-games.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const UA = { 'user-agent': 'dann.com.ar game sync' };
const sources = JSON.parse(await readFile('content/sources.json', 'utf8'));

async function get(url, as = 'json') {
	const res = await fetch(url, { headers: UA });
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return as === 'json' ? res.json() : as === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

async function steam(appid) {
	const listing = async (l) => {
		const r = (await get(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=${l}&cc=us`))[appid];
		if (!r?.success) throw new Error(`steam ${appid} (${l}): no data`);
		return r.data;
	};
	const [en, es] = [await listing('english'), await listing('spanish')];
	const reviews = (await get(`https://store.steampowered.com/appreviews/${appid}?json=1&language=all&num_per_page=0`)).query_summary;
	// Steam falls back to English when there is no Spanish listing: store null so the site can say so.
	const t = (k) => ({ en: en[k], es: es[k] === en[k] ? null : es[k] });
	return {
		source: 'steam',
		id: appid,
		url: `https://store.steampowered.com/app/${appid}/`,
		title: en.name,
		short: t('short_description'),
		description_html: t('about_the_game'),
		developers: en.developers ?? [],
		publishers: en.publishers ?? [],
		release_date: en.release_date?.date ?? null,
		platforms: Object.keys(en.platforms ?? {}).filter((p) => en.platforms[p]),
		price: en.is_free ? 'Free' : (en.price_overview?.final_formatted ?? null),
		genres: (en.genres ?? []).map((g) => g.description),
		reviews: reviews ? { positive: reviews.total_positive, total: reviews.total_reviews, summary: reviews.review_score_desc } : null,
		trailer: en.movies?.[0] ? { name: en.movies[0].name, thumbnail: en.movies[0].thumbnail } : null,
		images: { cover: en.header_image, screenshots: (en.screenshots ?? []).map((s) => s.path_full) }
	};
}

// itch.io serves meta attributes in either order.
export const ogImage = (html) =>
	html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/)?.[1] ?? null;
// "<title>Bahía Game Jam 2022 - itch.io</title>" -> "Bahía Game Jam 2022"
export const pageTitle = (html) => html.match(/<title>([^<]*?)(?: - itch\.io)?<\/title>/)?.[1] ?? null;

// The "More information" table: {"Made with": ["Godot", …], "AI Disclosure": ["AI Assisted", "Code"], "Published": "19 October 2026 @ 14:22 UTC", …}
export function itchInfo(html) {
	const table = html.match(/class="game_info_panel_widget[\s\S]*?<\/table>/)?.[0] ?? '';
	const info = {};
	for (const [, label, cell] of table.matchAll(/<tr><td>([^<]+)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)) {
		const text = (s) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
		const links = [...cell.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]));
		// Dates show as "2 days ago"; keep the absolute one so the file doesn't change every day.
		const date = cell.match(/<abbr title="([^"]+)"/)?.[1];
		// itch shuffles attribute order per response; the tooltip text is stable.
		const r = cell.match(/data-tooltip="([\d.]+) average rating from (\d+) total rating/);
		const rating = r && { average: Number(r[1]), count: Number(r[2]) };
		info[label] = rating || date || (links.length ? links : text(cell));
	}
	return info;
}

// path like "56/little-eyes"; taken from the itch page's own ldjam.com link, since titles collide between entries.
async function ludumDare(path) {
	const walk = await get(`https://api.ldjam.com/vx/node2/walk/1/events/ludum-dare/${path}`);
	if (walk.extra.length) throw new Error(`ldjam: no entry at ${path}`);
	const node = async (id) => (await get(`https://api.ldjam.com/vx/node2/get/${id}`)).node[0];
	const [game, event] = [await node(walk.node_id), await node(walk.path.at(-2))];
	const results = {};
	for (const [k, label] of Object.entries(event.meta)) {
		const rank = game.magic?.[`${k}-result`];
		if (/^grade-\d+$/.test(k) && rank) results[label] = { rank, average: game.magic[`${k}-average`] };
	}
	return {
		name: event.name,
		url: `https://ldjam.com${game.path}`,
		theme: event.meta['event-theme'] ?? null,
		format: game.subsubtype,
		results: Object.keys(results).length ? results : null
	};
}

async function itch(url) {
	const [data, page] = [await get(`${url}/data.json`), await get(url, 'text')];
	const jamUrl = page.match(/href="(https:\/\/itch\.io\/jam\/[^"/]+)\/rate\/\d+"/)?.[1] ?? null;
	const ldPath = page.match(/ldjam\.com\/events\/ludum-dare\/(\d+\/[a-z0-9-]+)/)?.[1];
	return {
		source: 'itch',
		id: data.id,
		url,
		title: data.title,
		authors: data.authors ?? [],
		tags: data.tags ?? [],
		info: itchInfo(page),
		jam: ldPath ? await ludumDare(ldPath) : jamUrl ? { name: pageTitle(await get(jamUrl, 'text')), url: jamUrl } : null,
		images: { cover: ogImage(page) || data.cover_image || null, screenshots: data.screenshots ?? [] }
	};
}

// itch.io also shuffles JSON key order per response; sorted keys keep comparisons and git diffs stable.
const sorted = (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const json = (v) => JSON.stringify(v, sorted, '\t');

const slugOf = (g) => (g.source === 'itch' ? basename(g.url) : g.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

// Only a starting value for a new game's own file; the CMS owns it afterwards.
export function suggestAi(info = {}) {
	if ([info.Content].flat().some((c) => /no generative ai/i.test(c ?? ''))) return 'hand';
	return info['AI Disclosure'] ? 'assisted' : '';
}

const own = (game) => ({
	ai: suggestAi(game.info),
	authorship: [],
	featured: false,
	hidden: false,
	role: { en: '', es: '' },
	summary: { en: '', es: '' }
});

async function save(game) {
	const slug = slugOf(game);
	await mkdir('content/games', { recursive: true });
	// 'wx' never overwrites: content/games/ is edited by hand or in the CMS.
	await writeFile(`content/games/${slug}.json`, json(own(game)) + '\n', { flag: 'wx' }).catch((e) => {
		if (e.code !== 'EEXIST') throw e;
	});
	const file = `content/store/${slug}.json`;
	const prev = await readFile(file, 'utf8').then(JSON.parse, () => null);
	const { synced_at, local_images, ...prevData } = prev ?? {};
	if (json(prevData) === json(game)) return console.log(`= ${slug}`);

	const dir = `public/games/${slug}`;
	await mkdir(dir, { recursive: true });
	const local = async (url, name) => {
		const ext = new URL(url).pathname.match(/\.(jpe?g|png|gif|webp)$/i)?.[0] ?? '.jpg';
		await writeFile(`${dir}/${name}${ext}`, await get(url, 'buffer'));
		return `/games/${slug}/${name}${ext}`;
	};
	const imgs = game.images;
	const out = {
		...game,
		local_images: {
			cover: imgs.cover ? await local(imgs.cover, 'cover') : null,
			screenshots: await Promise.all(imgs.screenshots.map((u, i) => local(u, `shot-${i + 1}`)))
		},
		synced_at: new Date().toISOString()
	};
	await mkdir('content/store', { recursive: true });
	await writeFile(file, json(out) + '\n');
	console.log(`+ ${slug}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.assert(pageTitle('<title>Bahía Game Jam 2022 - itch.io</title>') === 'Bahía Game Jam 2022');
	console.assert(ogImage('<meta property="og:image" content="a.png"/>') === 'a.png');
	console.assert(ogImage('<meta content="b.png" property="og:image"/>') === 'b.png');
	const info = itchInfo(
		'<div class="game_info_panel_widget"><table><tbody><tr><td>Published</td><td><abbr title="19 October 2026 @ 14:22 UTC">2 days ago</abbr></td></tr><tr><td>Publisher</td><td>Scope Overflow</td></tr><tr><td>Made with</td><td><a href="x">Blender</a>, <a href="y">Godot</a></td></tr></tbody></table>'
	);
	console.assert(JSON.stringify(info) === '{"Published":"19 October 2026 @ 14:22 UTC","Publisher":"Scope Overflow","Made with":["Blender","Godot"]}', info);
	console.assert(suggestAi({ Content: ['No generative AI was used'] }) === 'hand');
	console.assert(suggestAi({ 'AI Disclosure': ['AI Assisted', 'Code'] }) === 'assisted');
	console.assert(suggestAi(undefined) === '');

	// A failing source keeps its previous file untouched; the exit code still flags it.
	let failed = false;
	const run = async (label, fn) => {
		try {
			for (const g of [].concat(await fn())) await save(g);
		} catch (e) {
			failed = true;
			console.error(`! ${label}: ${e.message}`);
		}
	};
	for (const id of sources.steam ?? []) await run(`steam ${id}`, () => steam(id));
	for (const url of sources.itch ?? []) await run(url, () => itch(url.replace(/\/$/, '')));
	process.exit(failed ? 1 : 0);
}
