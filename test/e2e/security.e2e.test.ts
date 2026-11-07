import { describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const app = createApp();
const signWithUserSecret = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, env.USER_ACCESS_TOKEN_SECRET, {
    expiresIn: '15m',
    issuer: 'alkaa-backend-ts',
    audience: 'alkaa-clients'
  });

describe('auth security behaviour (no database required)', () => {
  it('rejects validate-token without a token', async () => {
    const res = await request(app).get('/api/v1/auth/validate-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('rejects a user-secret token that lacks a type claim', async () => {
    const token = signWithUserSecret({ id: 'user-1', email: 'user@example.com', orgId: 'org-1' });
    const res = await request(app)
      .get('/api/v1/auth/validate-token')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN_TYPE');
  });

  it('rejects a user-secret token claiming super-admin type', async () => {
    const token = signWithUserSecret({
      id: 'user-1',
      email: 'user@example.com',
      orgId: 'org-1',
      typ: 'super_admin'
    });
    const res = await request(app)
      .get('/api/v1/auth/validate-token')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN_TYPE');
  });

  it('rejects malformed access tokens', async () => {
    const res = await request(app)
      .get('/api/v1/auth/validate-token')
      .set('Authorization', 'Bearer not-a-jwt');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('validates the set-password body before touching the database', async () => {
    const res = await request(app)
      .post('/api/v1/auth/set-password')
      .send({ password: 'longenough123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'verificationToken' })])
    );
  });

  it('validates login input before touching the database', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('rejects an invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .send({ refreshToken: 'not-a-jwt' });

    expect(res.status).toBe(403);
  });

  it('requires a refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh-token').send({});
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/required/i);
  });
});
