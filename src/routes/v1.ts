import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.router.js';

export const v1Router = Router();

// Mount auth module under both /general (100% frontend backward compatible) and /auth
v1Router.use('/general', authRouter);
v1Router.use('/auth', authRouter);

export default v1Router;
