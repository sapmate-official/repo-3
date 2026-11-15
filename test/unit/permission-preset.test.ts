import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const prismaMock = vi.hoisted(() => ({
  permissionPreset: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../src/db/prisma.js', () => ({
  default: prismaMock,
  prisma: prismaMock
}));

import { PermissionPresetController } from '../../src/modules/permission-preset/permission-preset.controller.js';

describe('PermissionPresetController', () => {
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

  it('lists permission presets for an organization', async () => {
    const mockPresets = [
      { id: 'p-1', orgId: 'org-1', name: 'HR Manager', permissions: ['user_read', 'leave_manage'] }
    ];

    prismaMock.permissionPreset.findMany.mockResolvedValue(mockPresets);

    const req = {
      params: { orgId: 'org-1' },
      user: { id: 'user-1', orgId: 'org-1' }
    } as unknown as Request;

    const res = mockRes();
    await PermissionPresetController.getPresets(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockPresets);
  });

  it('gets preset by ID', async () => {
    const mockPreset = { id: 'p-1', orgId: 'org-1', name: 'HR Manager', permissions: [] };

    prismaMock.permissionPreset.findUnique.mockResolvedValue(mockPreset);

    const req = {
      params: { id: 'p-1' }
    } as unknown as Request;

    const res = mockRes();
    await PermissionPresetController.getPresetById(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockPreset);
  });

  it('creates new preset successfully', async () => {
    const newPreset = {
      id: 'p-new',
      orgId: 'org-1',
      name: 'Custom Team Lead',
      description: 'Lead role',
      permissions: ['task_write']
    };

    prismaMock.permissionPreset.findFirst.mockResolvedValue(null);
    prismaMock.permissionPreset.create.mockResolvedValue(newPreset);

    const req = {
      body: {
        orgId: 'org-1',
        name: 'Custom Team Lead',
        description: 'Lead role',
        permissions: ['task_write']
      }
    } as unknown as Request;

    const res = mockRes();
    await PermissionPresetController.createPreset(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newPreset);
  });

  it('updates an existing preset', async () => {
    const existing = { id: 'p-1', orgId: 'org-1', name: 'Lead', permissions: [] };
    const updated = { ...existing, description: 'Updated description' };

    prismaMock.permissionPreset.findUnique.mockResolvedValue(existing);
    prismaMock.permissionPreset.update.mockResolvedValue(updated);

    const req = {
      params: { id: 'p-1' },
      body: { description: 'Updated description' }
    } as unknown as Request;

    const res = mockRes();
    await PermissionPresetController.updatePreset(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it('deletes an existing preset', async () => {
    const existing = { id: 'p-1', orgId: 'org-1', name: 'Lead' };

    prismaMock.permissionPreset.findUnique.mockResolvedValue(existing);
    prismaMock.permissionPreset.delete.mockResolvedValue(existing);

    const req = {
      params: { id: 'p-1' }
    } as unknown as Request;

    const res = mockRes();
    await PermissionPresetController.deletePreset(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'Preset deleted successfully' });
  });
});
