import { Context } from "effect";

/** The request's bindings, which repositories and integration services build themselves from. */
export class WorkerEnv extends Context.Service<WorkerEnv, Env>()("@murugappan/api/WorkerEnv") {}
