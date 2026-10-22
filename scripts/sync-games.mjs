// Pulls store data (Steam, itch.io, GitHub, Godot Asset Library) into content/store/<slug>.json and images into public/games/<slug>/.
// Only store-owned fields live here; your own fields (AI label, authorship, texts) go in separate files the sync never touches.
// Usage: node scripts/sync-games.mjs
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, posix } from 'node:path';

const UA = { 'user-agent': 'dann.com.ar game sync' };
const sources = JSON.parse(await readFile('content/sources.json', 'utf8'));

// content/sources.json is edited in the CMS, so entries may be links or bare ids.
export const steamId = (v) => Number(String(v).match(/(?:app\/)?(\d+)/)?.[1]);
export const itchUrl = (v) => String(v).trim().replace(/\/$/, '');
export const githubRepo = (v) => String(v).trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
export const assetId = (v) => Number(String(v).match(/(?:asset\/)?(\d+)/)?.[1]);
// "owner/repo" (its docs/ folder) or a folder link "https://github.com/owner/repo/tree/<branch>/<folder>".
// shortcut: a branch with "/" in its name reads as branch + folder; fine until such a branch is used.
export function wikiSource(v) {
	const m = String(v).trim().replace(/\/$/, '').match(/^(?:https:\/\/github\.com\/)?([\w.-]+\/[\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)(?:\/(.+))?)?$/);
	return m && { repo: m[1], ref: m[2] ?? null, dir: m[3] ?? (m[2] ? '' : 'docs'), slug: basename(m[1]).toLowerCase() };
}
const wanted = {
	steam: (sources.steam ?? []).map(steamId).filter(Boolean),
	// { url, repo? }: the repo is the game's public source, if any.
	itch: (sources.itch ?? []).map((v) => ({ url: itchUrl(v.url ?? v), repo: v.repo?.trim() ? githubRepo(v.repo) : null })).filter((e) => e.url),
	github: (sources.github ?? []).map(githubRepo).filter(Boolean),
	assetlib: (sources.assetlib ?? []).map(assetId).filter(Boolean),
	wikis: (sources.wikis ?? []).map(wikiSource).filter(Boolean)
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

async function itch(url, repo) {
	const [data, page] = [await get(`${url}/data.json`), await get(url, 'text')];
	const jamUrl = page.match(/href="(https:\/\/itch\.io\/jam\/[^"/]+)\/rate\/\d+"/)?.[1] ?? null;
	const ldPath = page.match(/ldjam\.com\/events\/ludum-dare\/(\d+\/[a-z0-9-]+)/)?.[1];
	const cover = ogImage(page) || data.cover_image || null;
	return {
		source: 'itch',
		id: data.id,
		url,
		title: data.title,
		authors: data.authors ?? [],
		tags: data.tags ?? [],
		info: itchInfo(page),
		// only when set, so adding the field doesn't rewrite every game's data
		...(repo && { repo }),
		jam: ldPath ? await ludumDare(ldPath) : jamUrl ? { name: pageTitle(await get(jamUrl, 'text')), url: jamUrl } : null,
		// The page's list often repeats the cover as its first picture.
		images: { cover, screenshots: (data.screenshots?.length ? data.screenshots : itchShots(page)).filter((u) => u !== cover) }
	};
}

// "owner/repo". No pushed_at: it changes on every push and would make each sync a new commit.
// Pictures in a README, in order, without badges or vector logos; relative paths resolve against the README's folder, rooted ones against the repo.
export function readmeImages(md, base, root) {
	const srcs = [...md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+)/g)].map((m) => m[1] ?? m[2]);
	return [...new Set(srcs.map((s) => new URL(/^\/(?!\/)/.test(s) ? s.slice(1) : s, /^\/(?!\/)/.test(s) ? root : base).href.replace(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:blob|raw)\//, 'https://raw.githubusercontent.com/$1/')))]
		.filter((u) => /^https:/.test(u) && !/shields\.io|badge|\/workflows\/|\.svg(\?|$)/i.test(u));
}

// Repos listed but not public yet (the API answers 404 for private ones): skipped without failing, and their old data is pruned.
const unpublished = new Set();
async function github(repo) {
	const r = await get(`https://api.github.com/repos/${repo}`).catch((e) => {
		if (!e.message.startsWith('404 ')) throw e;
	});
	// A token that can read the repo would still see it; private never gets published.
	if (!r || r.private) {
		unpublished.add(repo.toLowerCase());
		console.log(`· github ${repo}: not public, waits for a later sync`);
		return [];
	}
	const readme = await get(`https://api.github.com/repos/${repo}/readme`).catch(() => null);
	const root = `https://raw.githubusercontent.com/${r.full_name}/${r.default_branch}/`;
	const pics = readme ? readmeImages(Buffer.from(readme.content, 'base64').toString(), root + readme.path, root) : [];
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
		// The README's first picture is the cover; GitHub's generated card only when it has none.
		images: { cover: pics[0] ?? `https://opengraph.githubassets.com/1/${r.full_name}`, screenshots: pics.slice(1, 7) }
	};
}

async function assetlib(id) {
	const a = await get(`https://godotengine.org/asset-library/api/asset/${id}`);
	const pics = (a.previews ?? []).filter((p) => p.type === 'image').map((p) => p.link);
	return {
		source: 'assetlib',
		id: Number(a.asset_id),
		url: `https://godotengine.org/asset-library/asset/${a.asset_id}`,
		title: a.title,
		description: a.description,
		homepage: a.browse_url || null,
		license: a.cost,
		godot_version: a.godot_version,
		version: a.version_string,
		category: a.category,
		authors: [{ name: a.author }],
		images: { cover: pics[0] ?? a.icon_url ?? null, screenshots: pics.slice(1, 7) }
	};
}

// A doc's address inside its wiki: "guide/Setup.md" -> "guide/setup", a folder's README or index -> the folder.
export const wikiPath = (rel) =>
	rel.replace(/\.md$/i, '').split('/').filter((p, i, a) => i < a.length - 1 || !/^(readme|index)$/i.test(p)).map((p) => p.toLowerCase().replace(/[^a-z0-9_-]+/g, '-')).join('/');

// Links between docs become links between site pages (relative, so they work under either language); anything else points at the repo.
export function wikiLinks(md, rel, base, root) {
	return md.replace(/(\]\(\s*<?|<(?:img|a)\b[^>]*?(?:src|href)=["'])([^)\s>"']+)/g, (all, pre, target) => {
		if (/^([a-z][\w+.-]*:|#|\/\/)/i.test(target)) return all;
		const [path, hash = ''] = target.split(/(?=#)/);
		const to = posix.normalize(posix.join(posix.dirname(rel), path));
		if (/\.md$/i.test(path) && !path.startsWith('/') && !to.startsWith('..')) {
			return pre + (posix.relative('/' + wikiPath(rel), '/' + wikiPath(to)) || '.') + '/' + hash;
		}
		return pre + (path.startsWith('/') ? new URL(target.slice(1), root) : new URL(target, base + rel)).href;
	});
}

// shortcut: one tree call lists up to ~100k files; enough for docs folders, not for monorepos.
async function wiki({ repo, ref, dir }) {
	const branch = ref ?? (await get(`https://api.github.com/repos/${repo}`)).default_branch;
	const tree = await get(`https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`);
	const prefix = dir ? dir + '/' : '';
	const files = tree.tree.filter((f) => f.type === 'blob' && f.path.startsWith(prefix) && /\.md$/i.test(f.path)).map((f) => f.path.slice(prefix.length));
	if (!files.length) throw new Error(`no .md files in ${repo}/${dir}`);
	const root = `https://raw.githubusercontent.com/${repo}/${branch}/`;
	return Promise.all(files.map(async (rel) => {
		const md = await get(root + prefix + rel, 'text');
		// The first heading is the page title; the site prints it itself.
		const h1 = md.match(/^#[ \t]+(.+?)[ \t#]*$/m);
		return {
			rel,
			title: h1?.[1] ?? (wikiPath(rel) ? basename(rel, '.md') : basename(repo)),
			source: `https://github.com/${repo}/blob/${branch}/${prefix}${rel}`,
			body: wikiLinks(h1 ? md.replace(h1[0], '') : md, rel, root + prefix, root)
		};
	}));
}

// Rewritten whole on every sync; unchanged docs come out byte-identical, so git sees no change.
async function saveWiki(w, docs) {
	const dir = `content/wiki/${w.slug}`;
	await rm(dir, { recursive: true, force: true });
	for (const d of docs) {
		const meta = { title: d.title, slug: [w.slug, wikiPath(d.rel)].filter(Boolean).join('/'), wiki: w.slug, repo: w.repo, source: d.source };
		await mkdir(posix.dirname(`${dir}/${d.rel}`), { recursive: true });
		// JSON strings are valid YAML scalars.
		await writeFile(`${dir}/${d.rel}`, `---\n${Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n')}\n---\n${d.body}`);
	}
	console.log(`~ wiki ${w.slug} (${docs.length})`);
}

// itch.io also shuffles JSON key order per response; sorted keys keep comparisons and git diffs stable.
const sorted = (_, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const json = (v) => JSON.stringify(v, sorted, '\t');

const slugOf = (g) => (g.source === 'itch' || g.source === 'github' ? basename(g.url).toLowerCase() : g.title.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));

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
		: d.source === 'itch' ? wanted.itch.some((e) => e.url === d.url)
		: d.source === 'assetlib' ? wanted.assetlib.includes(d.id)
		: wanted.github.some((r) => !unpublished.has(r.toLowerCase()) && d.url.toLowerCase() === `https://github.com/${r}`.toLowerCase());
	for (const f of await readdir('content/store').catch(() => [])) {
		if (!f.endsWith('.json')) continue;
		const d = JSON.parse(await readFile(`content/store/${f}`, 'utf8'));
		if (keep(d)) continue;
		const slug = f.replace(/\.json$/, '');
		await rm(`content/store/${f}`);
		await rm(`public/games/${slug}`, { recursive: true, force: true });
		console.log(`- ${slug}`);
	}
	for (const d of await readdir('content/wiki').catch(() => [])) {
		if (wanted.wikis.some((w) => w.slug === d)) continue;
		await rm(`content/wiki/${d}`, { recursive: true, force: true });
		console.log(`- wiki ${d}`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	console.assert(steamId('https://store.steampowered.com/app/2824960/Fracas/') === 2824960 && steamId(2824960) === 2824960);
	console.assert(githubRepo('https://github.com/dannroda/itchy-api/') === 'dannroda/itchy-api');
	console.assert(assetId('https://godotengine.org/asset-library/asset/1918') === 1918 && assetId('1918') === 1918);
	{
		const pics = readmeImages('![b](https://img.shields.io/x) ![s](docs/shot.png) <img src="logo.svg"> ![g](https://github.com/o/r/blob/main/a.gif) ![r](/media/b.png)', 'https://raw.githubusercontent.com/o/r/main/docs/README.md', 'https://raw.githubusercontent.com/o/r/main/');
		console.assert(JSON.stringify(pics) === '["https://raw.githubusercontent.com/o/r/main/docs/docs/shot.png","https://raw.githubusercontent.com/o/r/main/a.gif","https://raw.githubusercontent.com/o/r/main/media/b.png"]', pics);
	}
	console.assert(JSON.stringify(wikiSource('https://github.com/o/My.Repo/tree/main/docs/en')) === '{"repo":"o/My.Repo","ref":"main","dir":"docs/en","slug":"my.repo"}');
	console.assert(wikiSource('o/r').dir === 'docs' && wikiSource('https://github.com/o/r/tree/dev').dir === '' && wikiSource('nope') === null);
	console.assert(wikiPath('README.md') === '' && wikiPath('guide/Getting Started.md') === 'guide/getting-started' && wikiPath('guide/index.md') === 'guide');
	{
		const md = wikiLinks('[a](api.md#x) [b](../README.md) ![c](img/c.png) [d](/src/x.gd) [e](https://x.org) [f](#top)', 'guide/setup.md', 'https://raw.githubusercontent.com/o/r/main/docs/', 'https://raw.githubusercontent.com/o/r/main/');
		console.assert(md === '[a](../api/#x) [b](../../) ![c](https://raw.githubusercontent.com/o/r/main/docs/guide/img/c.png) [d](https://raw.githubusercontent.com/o/r/main/src/x.gd) [e](https://x.org) [f](#top)', md);
	}
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
	for (const { url, repo } of wanted.itch) await run(url, () => itch(url, repo));
	for (const repo of wanted.github) await run(`github ${repo}`, () => github(repo));
	for (const id of wanted.assetlib) await run(`assetlib ${id}`, () => assetlib(id));
	for (const w of wanted.wikis) await run(`wiki ${w.repo}`, async () => (await saveWiki(w, await wiki(w)), []));
	await prune();
	process.exit(failed ? 1 : 0);
}
