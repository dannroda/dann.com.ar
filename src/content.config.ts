import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const i18n = z.object({ en: z.string().nullable(), es: z.string().nullable() });
const images = z.object({ cover: z.string().nullable(), screenshots: z.array(z.string()) });

// Written by scripts/sync-games.mjs; never edit by hand.
const store = defineCollection({
	loader: glob({ pattern: '*.json', base: './content/store' }),
	schema: z.object({
		source: z.enum(['steam', 'itch']),
		id: z.number(),
		url: z.string().url(),
		title: z.string(),
		local_images: images,
		synced_at: z.string(),
		// steam
		short: i18n.optional(),
		developers: z.array(z.string()).optional(),
		release_date: z.string().nullable().optional(),
		platforms: z.array(z.string()).optional(),
		price: z.string().nullable().optional(),
		genres: z.array(z.string()).optional(),
		// itch
		authors: z.array(z.object({ name: z.string(), url: z.string() })).optional(),
		info: z.record(z.string(), z.unknown()).optional(),
		jam: z
			.object({
				name: z.string().nullable(),
				url: z.string(),
				theme: z.string().nullable().optional(),
				results: z.record(z.string(), z.object({ rank: z.number(), average: z.number() })).nullable().optional()
			})
			.nullable()
			.optional()
	})
});

export const collections = { store };
