import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireOrgScope } from '../../src/middleware/requireOrgScope.js';

const buildApp = (user: unknown) => {
  const app = express();
  app.use(express.json());

  app.use((req, _res, next) => {
    (req as unknown as { user?: unknown }).user = user;
    next();
  });

  app.get('/orgs/:orgId/items', requireOrgScope('orgId'), (req, res) => {
    res.status(200).json({ orgId: req.params.orgId });
  });

  app.get('/items', requireOrgScope('orgId'), (req, res) => {
    res.status(200).json({ orgId: req.params.orgId });
  });

  return app;
};

const user = {
  id: 'user-1',
  email: 'user@example.com',
  orgId: 'org-a',
  roles: [],
  permissions: [],
  isSuperAdmin: false
};

describe('requireOrgScope', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(buildApp(undefined)).get('/orgs/org-a/items');
    expect(res.status).toBe(401);
  });

  it('rejects a user without an organization', async () => {
    const res = await request(buildApp({ ...user, orgId: undefined })).get('/orgs/org-a/items');
    expect(res.status).toBe(401);
  });

  it('allows matching organization ids', async () => {
    const res = await request(buildApp(user)).get('/orgs/org-a/items');
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org-a');
  });

  it('allows super-admins to access any organization', async () => {
    const superAdmin = { ...user, orgId: 'platform-superadmin', isSuperAdmin: true };
    const res = await request(buildApp(superAdmin)).get('/orgs/org-b/items');
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org-b');
  });

  it('rejects a mismatched organization id', async () => {
    const res = await request(buildApp(user)).get('/orgs/org-b/items');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TENANT_MISMATCH');
  });

  it('injects the authenticated orgId when none is supplied', async () => {
    const res = await request(buildApp(user)).get('/items');
    expect(res.status).toBe(200);
    expect(res.body.orgId).toBe('org-a');
  });

  it('rejects a mismatched orgId supplied in the body', async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { user?: unknown }).user = user;
      next();
    });
    app.post('/items', requireOrgScope('orgId'), (req, res) => {
      res.status(200).json({ orgId: req.body.orgId });
    });

    const res = await request(app).post('/items').send({ orgId: 'org-b' });
    expect(res.status).toBe(403);
  });
});
