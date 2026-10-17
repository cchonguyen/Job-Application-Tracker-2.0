import { Router } from 'express';
import { jobsRouter } from './jobs.routes.ts';
import { extractRouter } from './extract.routes.ts';
import { authConfigRouter } from './authConfig.routes.ts';
import { requireUser } from '../middleware/requireUser.ts';

export const apiRouter = Router();

// Public: tells the browser how to sign in. Everything after this requires a signed-in user.
apiRouter.use('/auth', authConfigRouter);

apiRouter.use(requireUser);

apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/', extractRouter);
