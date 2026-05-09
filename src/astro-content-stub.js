/**
 * Shim for the `astro:content` virtual module used by emdash.
 *
 * The @cloudflare/vite-plugin's worker environment doesn't have access to
 * Vite's virtual module pipeline, so `astro:content` can't be resolved there.
 * Wrangler's `alias` config redirects the import here instead.
 *
 * We wire up the emdash loader directly, mirroring what Astro generates in the
 * real virtual module from src/live.config.ts.
 */
import {
	createGetLiveCollection,
	createGetLiveEntry,
	createGetCollection,
	createGetEntries,
	createGetEntry,
	createReference,
	createDeprecatedFunction,
	defineCollection,
	defineLiveCollection,
	renderEntry as render,
} from "astro/content/runtime";
import { emdashLoader } from "emdash/runtime";

const loader = emdashLoader();

const liveCollections = {
	_emdash: { loader },
};

export const getLiveCollection = createGetLiveCollection({ liveCollections });
export const getLiveEntry = createGetLiveEntry({ liveCollections });
export const getCollection = createGetCollection({ liveCollections });
export const getEntry = createGetEntry({ liveCollections });
export const getEntries = createGetEntries(getEntry);
export const reference = createReference();
export { defineCollection, defineLiveCollection, render };

export const getEntryBySlug = createDeprecatedFunction("getEntryBySlug");
export const getDataEntryById = createDeprecatedFunction("getDataEntryById");
