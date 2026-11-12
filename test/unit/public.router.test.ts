import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const prismaMock = vi.hoisted(() => ({
  organization: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
  onboardingCandidate: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn()
  }
}));

const emailMock = vi.hoisted(() => ({
  sendDemoRequestEmails: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

vi.mock('../../src/services/email.service.js', () => ({
  EmailService: emailMock
}));

const demoRequest = {
  name: 'Demo User',
  company: 'Acme Corp',
  phoneNumber: '+15551234567',
  email: 'demo@example.test'
};

const buildApp = async () => {
  vi.resetModules();
  const { publicRouter } = await import('../../src/modules/public/public.router.js');
  const app = express();
  app.use(express.json());
  app.use(publicRouter);
  return app;
};

describe('public demo request routing', () => {
  beforeEach(() => {
    vi.mocked(prismaMock.organization.findUnique).mockReset();
    vi.mocked(prismaMock.user.findFirst).mockReset();
    vi.mocked(prismaMock.onboardingCandidate.findUnique).mockReset();
    vi.mocked(prismaMock.onboardingCandidate.update).mockReset();
    vi.mocked(prismaMock.onboardingCandidate.create).mockReset();
    vi.mocked(emailMock.sendDemoRequestEmails).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('updates an existing candidate only when they belong to the configured demo org', async () => {
    vi.stubEnv('PUBLIC_DEMO_ORG_ID', 'org-demo');
    const app = await buildApp();

    vi.mocked(prismaMock.organization.findUnique).mockResolvedValue({
      id: 'org-demo',
      users: [{ id: 'admin-1' }]
    });
    vi.mocked(prismaMock.onboardingCandidate.findUnique).mockResolvedValue({
      id: 'candidate-1',
      orgId: 'org-demo',
      formData: { source: 'existing' }
    });

    const res = await request(app).post('/demo-request').send(demoRequest);

    expect(res.status).toBe(200);
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-demo' },
      include: { users: { take: 1 } }
    });
    expect(prismaMock.onboardingCandidate.update).toHaveBeenCalledOnce();
    expect(prismaMock.onboardingCandidate.create).not.toHaveBeenCalled();
  });

  it('does not update a candidate that belongs to another organization', async () => {
    vi.stubEnv('PUBLIC_DEMO_ORG_ID', 'org-demo');
    const app = await buildApp();

    vi.mocked(prismaMock.organization.findUnique).mockResolvedValue({
      id: 'org-demo',
      users: [{ id: 'admin-1' }]
    });
    vi.mocked(prismaMock.onboardingCandidate.findUnique).mockResolvedValue({
      id: 'candidate-1',
      orgId: 'org-other',
      formData: {}
    });

    const res = await request(app).post('/demo-request').send(demoRequest);

    expect(res.status).toBe(200);
    expect(prismaMock.onboardingCandidate.update).not.toHaveBeenCalled();
    expect(prismaMock.onboardingCandidate.create).not.toHaveBeenCalled();
    expect(emailMock.sendDemoRequestEmails).toHaveBeenCalledOnce();
  });

  it('does not write a candidate when no demo organization is configured', async () => {
    vi.stubEnv('PUBLIC_DEMO_ORG_ID', '');
    const app = await buildApp();

    const res = await request(app).post('/demo-request').send(demoRequest);

    expect(res.status).toBe(200);
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.onboardingCandidate.findUnique).not.toHaveBeenCalled();
    expect(emailMock.sendDemoRequestEmails).toHaveBeenCalledOnce();
  });
});
