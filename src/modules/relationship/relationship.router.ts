import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { RelationshipController } from './relationship.controller.js';

export const relationshipRouter = Router();

// Guard all relationship routes with authentication and org scope
relationshipRouter.use(authenticateAny, requireOrgScope());

// Relationship with a specific user
relationshipRouter.get('/user/:targetUserId', RelationshipController.getUserRelationship);

// Relationship with organization
relationshipRouter.get('/organization', RelationshipController.getOrganizationRelationship);

// Root fallback (matches organization info)
relationshipRouter.get('/', RelationshipController.getOrganizationRelationship);
