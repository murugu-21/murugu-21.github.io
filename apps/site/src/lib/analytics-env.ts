import { POST_HOG_TOKEN, POST_HOG_URL } from "astro:env/server";

export const analyticsConfigured = !!POST_HOG_TOKEN?.trim() && !!POST_HOG_URL?.trim();
