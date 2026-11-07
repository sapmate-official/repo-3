import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { UserRoleController } from './userRole.controller.js';

export const userRoleRouter = Router();

userRoleRouter.use(authenticateAny);

userRoleRouter.get('/user/:userId', UserRoleController.listForUser);
userRoleRouter.post('/', UserRoleController.assign);
userRoleRouter.delete('/', UserRoleController.remove);
userRoleRouter.delete('/:id', UserRoleController.removeById);

export default userRoleRouter;
