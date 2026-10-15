import { Router } from 'express';
import { jobsRouter } from './jobs.routes.ts';
import { extractRouter } from './extract.routes.ts';
import { requireApiKey } from '../middleware/requireApiKey.ts';

export const apiRouter = Router();

apiRouter.use(requireApiKey);

apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/', extractRouter);
