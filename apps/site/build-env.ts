import { envField } from "astro/config";

export const ENV_SCHEMA = {
  PUBLIC_CHAT_HOST: envField.string({ context: "client", access: "public", optional: true }),
  // Written into page meta tags, so only the public phc_ key belongs here, never the phx_ one.
  POST_HOG_TOKEN: envField.string({
    context: "server",
    access: "public",
    optional: true,
    startsWith: "phc_"
  }),
  POST_HOG_URL: envField.string({
    context: "server",
    access: "public",
    optional: true,
    url: true
  }),
  GITHUB_TOKEN: envField.string({ context: "server", access: "secret", optional: true }),
  REQUIRE_GITHUB_PROFILE: envField.enum({
    context: "server",
    access: "public",
    values: ["0", "1"],
    default: "0"
  }),
  RESUME_PHONE: envField.string({ context: "server", access: "secret", optional: true })
};

const SOURCE_MAP_ENV = {
  personalApiKey: "POSTHOG_API_KEY",
  projectId: "POSTHOG_PROJECT_ID"
} as const;

export const sourceMapUpload = {
  personalApiKey: process.env[SOURCE_MAP_ENV.personalApiKey]?.trim(),
  projectId: process.env[SOURCE_MAP_ENV.projectId]?.trim()
};

export const BUILD_ENV_NAMES = [...Object.keys(ENV_SCHEMA), ...Object.values(SOURCE_MAP_ENV)];
