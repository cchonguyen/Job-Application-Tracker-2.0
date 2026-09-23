import { Router } from 'express';
import { jobsRouter } from './jobs.routes.ts';
import { extractRouter } from './extract.routes.ts';

export const apiRouter = Router();

apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/', extractRouter);
