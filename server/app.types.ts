import type { JobScope } from './services/storage/index.ts';

export interface RequestUser {
  id: string;
  email: string | null;
}

/** Per-request values the API middleware sets for the routes behind it. */
export type AppEnv = {
  Variables: {
    /** Set by requireUser: who is calling, and a store scope limited to their jobs. */
    user?: RequestUser;
    jobScope?: JobScope;
  };
};
