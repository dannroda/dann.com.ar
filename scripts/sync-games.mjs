// Pulls store data (Steam, itch.io, GitHub) into content/store/<slug>.json and images into public/games/<slug>/.
// Only store-owned fields live here; your own fields (AI label, authorship, texts) go in separate files the sync never touches.
// Usage: node scripts/sync-games.mjs
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const UA = { 'user-agent': 'dann.com.ar game sync' };
const sources = JSON.parse(await readFile('content/sources.json', 'utf8'));

// content/sources.json is edited in the CMS, so entries may be links or bare ids.
export const steamId = (v) => Number(String(v).match(/(?:app\/)?(\d+)/)?.[1]);
export const itchUrl = (v) => String(v).trim().replace(/\/$/, '');
export const githubRepo = (v) => String(v).trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
const wanted = {
	steam: (sources.steam ?? []).map(steamId).filter(Boolean),
	itch: (sources.itch ?? []).map(itchUrl).filter(Boolean),
	github: (sources.github ?? []).map(githubRepo).filter(Boolean)
};

// The Actions GITHUB_TOKEN lifts the GitHub API's anonymous rate limit; optional locally.
const auth = process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};

async function get(url, as = 'json', retries = 3) {
	const res = await fetch(url, { headers: url.startsWith('https://api.github.com/') ? { ...UA, ...auth } : UA });
	// GitHub's preview-image service rate-limits bursts; back off and retry.
	if (res.status === 429 && retries > 0) {
		await new Promise((r) => setTimeout(r, (4 - retries) * 3000));
		return get(url, as, retries - 1);
	}
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
		// Steam only serves trailers as HLS/DASH streams; the site shows the poster and links to the store.
		trailer: en.movies?.[0] ? { name: en.movies[0].name } : null,
		images: { cover: en.header_image, trailer: en.movies?.[0]?.thumbnail ?? null, screenshots: (en.screenshots ?? []).map((s) => s.path_full) }
	};
}

// itch.io serves meta attributes in either order.
export const ogImage = (html) =>
	html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/)?.[1] ?? html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:image"/)?.[1] ?? null;
// data.json often has no screenshots; the page's own list links the originals.
export const itchShots = (html) => {
	const list = html.split('class="screenshot_list"')[1]?.split('</div>')[0] ?? '';
	return [...list.matchAll(/href="(https:\/\/img\.itch\.zone\/[^"]+)"/g)].map((m) => m[1]);
};
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
		// entries in the same format (jam or compo), to read the rank against
		entries: (await get(`https://api.ldjam.com/vx/stats/${event.id}`)).stats?.[game.subsubtype] ?? null,
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
		images: { cover: ogImage(page) || data.cover_image || null, screenshots: data.screenshots?.length ? data.screenshots : itchShots(page) }
	};
}

// "owner/repo". No pushed_at: it changes on every push and would make each sync a new commit.
async function github(repo) {
	const r = await get(`https://api.github.com/repos/${repo}`);
	return {
		source: 'github',
		id: r.id,
		url: r.html_url,
		title: r.name,
		description: r.description,
		homepage: r.homepage || null,
		language: r.language,
		topics: r.topics ?? [],
		stars: r.stargazers_count,
		archived: r.archived,
		license: r.license?.spdx_id ?? null,
		created: r.created_at.slice(0, 10),
		images: { cover: `https://opengraph.githubassets.com/1/${r.full_name}`, screenshots: [] }
	};
}

// itch.io also shuffles JSON key order per response; sorted keys keep comparisons and git diffs stable.
const sorted = (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const json = (v) => JSON.stringify(v, sorted, '\t');

const slugOf = (g) => (g.source !== 'steam' ? basename(g.url).toLowerCase() : g.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

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
			trailer: imgs.trailer ? await local(imgs.trailer, 'trailer') : null,
			screenshots: await Promise.all(imgs.screenshots.map((u, i) => local(u, `shot-${i + 1}`)))
		},
		synced_at: new Date().toISOString()
	};
	await mkdir('content/store', { recursive: true });
	await writeFile(file, json(out) + '\n');
	console.log(`+ ${slug}`);
}

// Removing an entry from content/sources.json removes its store data and images.
// Decided by the config, not by fetch results, so a store that is down never deletes anything.
// The own file in content/games/ stays: re-adding the game brings its label and texts back.
async function prune() {
	const keep = (d) =>
		d.source === 'steam' ? wanted.steam.includes(d.id)
		: d.source === 'itch' ? wanted.itch.includes(d.url)
		: wanted.github.some((r) => d.url.toLowerCase() === `https://github.com/${r}`.toLowerCase());
	for (const f of await readdir('content/store').catch(() => [])) {
		if (!f.endsWith('.json')) continue;
		const d = JSON.parse(await readFile(`content/store/${f}`, 'utf8'));
		if (keep(d)) continue;
		const slug = f.replace(/\.json$/, '');
		await rm(`content/store/${f}`);
		await rm(`public/games/${slug}`, { recursive: true, force: true });
		console.log(`- ${slug}`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.assert(steamId('https://store.steampowered.com/app/2824960/Fracas/') === 2824960 && steamId(2824960) === 2824960);
	console.assert(githubRepo('https://github.com/dannroda/itchy-api/') === 'dannroda/itchy-api');
	console.assert(itchUrl(' https://emarod.itch.io/mr-duck/ ') === 'https://emarod.itch.io/mr-duck');
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
	console.assert(itchShots('<div class="screenshot_list"><a target="_blank" href="https://img.itch.zone/a/original/x.jpg"><img/></a></div>')[0] === 'https://img.itch.zone/a/original/x.jpg');

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
	for (const id of wanted.steam) await run(`steam ${id}`, () => steam(id));
	for (const url of wanted.itch) await run(url, () => itch(url));
	for (const repo of wanted.github) await run(`github ${repo}`, () => github(repo));
	await prune();
	process.exit(failed ? 1 : 0);
}
