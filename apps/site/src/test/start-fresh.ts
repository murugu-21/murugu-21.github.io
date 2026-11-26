// Runs before each test file. With isolate: false the files on a worker share loaded modules,
// so this resets the stateful fakes, along with any stub or spy a previous file left.
import { vi } from "vite-plus/test";

import { setPosts } from "./astro-content.ts";
import { resetEnv } from "./astro-env-server.ts";
import { resetGithubSnapshot } from "./github-snapshot.ts";

vi.restoreAllMocks();
vi.unstubAllGlobals();
vi.unstubAllEnvs();
vi.useRealTimers();
setPosts([]);
resetEnv();
resetGithubSnapshot();
