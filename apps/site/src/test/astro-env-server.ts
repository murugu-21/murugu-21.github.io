type Env = Omit<typeof import("astro:env/server"), "getSecret">;

const BUILD_WITHOUT_SECRETS: Env = {
  POST_HOG_TOKEN: undefined,
  POST_HOG_URL: undefined,
  GITHUB_TOKEN: undefined,
  REQUIRE_GITHUB_PROFILE: "0",
  RESUME_PHONE: undefined
};

export let POST_HOG_TOKEN = BUILD_WITHOUT_SECRETS.POST_HOG_TOKEN;
export let POST_HOG_URL = BUILD_WITHOUT_SECRETS.POST_HOG_URL;
export let GITHUB_TOKEN = BUILD_WITHOUT_SECRETS.GITHUB_TOKEN;
export let REQUIRE_GITHUB_PROFILE = BUILD_WITHOUT_SECRETS.REQUIRE_GITHUB_PROFILE;
export let RESUME_PHONE = BUILD_WITHOUT_SECRETS.RESUME_PHONE;

function apply(env: Env): void {
  ({ POST_HOG_TOKEN, POST_HOG_URL, GITHUB_TOKEN, REQUIRE_GITHUB_PROFILE, RESUME_PHONE } = env);
}

export function setEnv(env: Partial<Env>): void {
  apply({
    POST_HOG_TOKEN,
    POST_HOG_URL,
    GITHUB_TOKEN,
    REQUIRE_GITHUB_PROFILE,
    RESUME_PHONE,
    ...env
  });
}

export function resetEnv(): void {
  apply(BUILD_WITHOUT_SECRETS);
}
