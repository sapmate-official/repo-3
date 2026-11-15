import { Router } from 'express';
import { authenticateAny } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';
import { EventController } from './events.controller.js';

export const eventsRouter = Router();

// GET /api/v2/events - Upcoming special events (birthdays, pending leaves, bills)
eventsRouter.get(
  '/',
  authenticateAny,
  requireOrgScope(),
  EventController.getEvents
);
