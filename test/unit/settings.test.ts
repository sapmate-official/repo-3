import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  organizationSettings: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { SettingsController } from '../../src/modules/settings/settings.controller.js';

describe('SettingsController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const next: NextFunction = vi.fn();

  it('fetches existing organization settings', async () => {
    const mockSettings = {
      id: 'settings-1',
      orgId: 'org-1',
      settings: { weekoff: [0, 6], notifications: true }
    };

    prismaMock.organizationSettings.findFirst.mockResolvedValue(mockSettings);

    const req = {
      params: { orgId: 'org-1' },
      user: { id: 'user-1', orgId: 'org-1' }
    } as unknown as Request;

    const res = mockRes();
    await SettingsController.fetchSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockSettings);
  });

  it('auto-provisions default settings when none exist', async () => {
    const createdSettings = {
      id: 'settings-new',
      orgId: 'org-1',
      settings: { weekoff: [0, 6] }
    };

    prismaMock.organizationSettings.findFirst.mockResolvedValue(null);
    prismaMock.organizationSettings.create.mockResolvedValue(createdSettings);

    const req = {
      params: { orgId: 'org-1' },
      user: { id: 'user-1', orgId: 'org-1' }
    } as unknown as Request;

    const res = mockRes();
    await SettingsController.fetchSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(createdSettings);
  });

  it('updates organization settings', async () => {
    const existing = {
      id: 'settings-1',
      orgId: 'org-1',
      settings: { weekoff: [0, 6] }
    };

    const updated = {
      id: 'settings-1',
      orgId: 'org-1',
      settings: { weekoff: [0], timezone: 'UTC' }
    };

    prismaMock.organizationSettings.findFirst.mockResolvedValue(existing);
    prismaMock.organizationSettings.update.mockResolvedValue(updated);

    const req = {
      params: { orgId: 'org-1' },
      user: { id: 'user-1', orgId: 'org-1' },
      body: { settings: { weekoff: [0], timezone: 'UTC' } }
    } as unknown as Request;

    const res = mockRes();
    await SettingsController.updateSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('resets organization settings to default', async () => {
    prismaMock.organizationSettings.findFirst.mockResolvedValue({ id: 's-1' });
    prismaMock.organizationSettings.updateMany.mockResolvedValue({ count: 1 });

    const req = {
      params: { orgId: 'org-1' },
      user: { id: 'user-1', orgId: 'org-1' }
    } as unknown as Request;

    const res = mockRes();
    await SettingsController.resetSettings(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Settings reset successfully' });
  });
});
