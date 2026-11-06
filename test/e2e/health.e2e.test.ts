import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

const app = createApp();
const allowedOrigin = env.CORS_ORIGINS.split(',')[0]!.trim();

describe('platform endpoints (no database required)', () => {
  it('GET /health returns service metadata', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'OK',
      service: 'alkaa-backend-ts'
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('echoes a caller-supplied request id', async () => {
    const res = await request(app).get('/health').set('X-Request-Id', 'test-request-id');
    expect(res.headers['x-request-id']).toBe('test-request-id');
  });

  it('generates a request id when none is supplied', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('allows configured CORS origins', async () => {
    const res = await request(app).get('/health').set('Origin', allowedOrigin);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers CORS preflight for configured origins', async () => {
    const res = await request(app)
      .options('/api/v1/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
  });

  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('mounts auth routes under /api/v1/general for backwards compatibility', async () => {
    const res = await request(app).get('/api/v1/general/validate-token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });
});
