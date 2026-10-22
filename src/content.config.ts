import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const i18n = z.object({ en: z.string().nullable(), es: z.string().nullable() });
const images = z.object({ cover: z.string().nullable(), trailer: z.string().nullable().optional(), screenshots: z.array(z.string()) });

// Written by scripts/sync-games.mjs; never edit by hand.
const store = defineCollection({
	loader: glob({ pattern: '*.json', base: './content/store' }),
	schema: z.object({
		source: z.enum(['steam', 'itch', 'github', 'assetlib']),
		id: z.number(),
		url: z.string().url(),
		title: z.string(),
		local_images: images,
		// remote originals; only the cover's address is read, to tell GitHub's generated card apart
		images: z.object({ cover: z.string().nullable() }).passthrough().optional(),
		synced_at: z.string(),
		// steam
		short: i18n.optional(),
		developers: z.array(z.string()).optional(),
		release_date: z.string().nullable().optional(),
		platforms: z.array(z.string()).optional(),
		price: z.string().nullable().optional(),
		genres: z.array(z.string()).optional(),
		trailer: z.object({ name: z.string() }).nullable().optional(),
		// github
		description: z.string().nullable().optional(),
		homepage: z.string().nullable().optional(),
		language: z.string().nullable().optional(),
		topics: z.array(z.string()).optional(),
		stars: z.number().optional(),
		archived: z.boolean().optional(),
		license: z.string().nullable().optional(),
		created: z.string().optional(),
		// Godot Asset Library
		godot_version: z.string().optional(),
		version: z.string().optional(),
		category: z.string().optional(),
		// itch
		authors: z.array(z.object({ name: z.string(), url: z.string().optional() })).optional(),
		info: z.record(z.string(), z.unknown()).optional(),
		jam: z
			.object({
				name: z.string().nullable(),
				url: z.string(),
				theme: z.string().nullable().optional(),
				entries: z.number().nullable().optional(),
				results: z.record(z.string(), z.object({ rank: z.number(), average: z.number() })).nullable().optional()
			})
			.nullable()
			.optional()
	})
});

// Your own data per game, edited in the CMS (/admin). The sync only creates missing files.
const text = z.object({ en: z.string().default(''), es: z.string().default('') }).default({ en: '', es: '' });
export const aiLevels = ['hand', 'assisted', 'vibe'] as const;
export const areas = ['design', 'code', 'art', 'audio', 'writing', 'tools', 'debugging'] as const;
export const authors = ['me', 'ai', 'team', 'third'] as const;
const games = defineCollection({
	loader: glob({ pattern: '*.json', base: './content/games' }),
	schema: z.object({
		ai: z.enum(aiLevels).or(z.literal('')).nullish(),
		featured: z.boolean().default(false),
		hidden: z.boolean().default(false),
		role: text,
		summary: text,
		authorship: z
			.array(z.object({ area: z.enum(areas), who: z.enum(authors), note: text }))
			.nullish()
			.transform((v) => v ?? [])
	})
});

// content/blog/<lang>/<slug>.md, the layout Sveltia's multiple_folders i18n writes.
const blog = defineCollection({
	loader: glob({ pattern: '*/*.md', base: './content/blog' }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		description: z.string().optional(),
		tags: z.array(z.string()).nullish().transform((v) => v ?? []),
		draft: z.boolean().default(false)
	})
});

// content/pages/<lang>/<slug>.md, from the CMS: landing pages and anything else that is not a post. Served at /<lang>/<slug>/.
const pages = defineCollection({
	loader: glob({ pattern: '*/*.md', base: './content/pages' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		// a game or project's file name; its page then links here
		project: z.string().nullish(),
		draft: z.boolean().default(false)
	})
});

// Written by scripts/sync-games.mjs from a repo's docs folder; never edit by hand.
const wiki = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './content/wiki' }),
	schema: z.object({ title: z.string(), wiki: z.string(), repo: z.string(), source: z.string().url() })
});

export const collections = { store, games, blog, pages, wiki };
