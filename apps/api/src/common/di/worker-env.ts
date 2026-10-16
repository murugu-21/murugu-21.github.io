import { Context } from "effect";

export class WorkerEnv extends Context.Service<WorkerEnv, Env>()("@murugappan/api/WorkerEnv") {}
