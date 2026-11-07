import { describe, expect, it } from 'vitest';
import {
  adminParamsSchema,
  createOrganizationSchema,
  listOrganizationsQuerySchema,
  setOrgAdminSchema,
  updateOrganizationSchema
} from '../../src/modules/organization/organization.schema.js';

describe('createOrganizationSchema', () => {
  it('accepts a minimal organization', () => {
    const result = createOrganizationSchema.safeParse({ name: 'Acme' });
    expect(result.success).toBe(true);
  });

  it('trims the organization name', () => {
    const result = createOrganizationSchema.parse({ name: '  Acme  ' });
    expect(result.name).toBe('Acme');
  });

  it('rejects a blank name', () => {
    const result = createOrganizationSchema.safeParse({ name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing name', () => {
    const result = createOrganizationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = createOrganizationSchema.parse({
      name: 'Acme',
      unexpected: 'value'
    });
    expect(result).not.toHaveProperty('unexpected');
  });

  it('coerces subscription dates', () => {
    const result = createOrganizationSchema.parse({
      name: 'Acme',
      subscriptionEnd: '2030-01-01T00:00:00.000Z'
    });
    expect(result.subscriptionEnd).toBeInstanceOf(Date);
  });
});

describe('updateOrganizationSchema', () => {
  it('accepts a single field', () => {
    const result = updateOrganizationSchema.safeParse({ industry: 'Software' });
    expect(result.success).toBe(true);
  });

  it('rejects an empty update', () => {
    const result = updateOrganizationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an update with only unknown fields', () => {
    const result = updateOrganizationSchema.safeParse({ unexpected: true });
    expect(result.success).toBe(false);
  });
});

describe('listOrganizationsQuerySchema', () => {
  it('applies pagination defaults', () => {
    const result = listOrganizationsQuerySchema.parse({});
    expect(result).toMatchObject({ page: 1, limit: 20 });
  });

  it('parses numeric strings', () => {
    const result = listOrganizationsQuerySchema.parse({ page: '2', limit: '10' });
    expect(result).toMatchObject({ page: 2, limit: 10 });
  });

  it('parses boolean filters without coercing "false" to true', () => {
    expect(listOrganizationsQuerySchema.parse({ isActive: 'true' }).isActive).toBe(true);
    expect(listOrganizationsQuerySchema.parse({ isActive: 'false' }).isActive).toBe(false);
  });

  it('rejects invalid pagination', () => {
    expect(listOrganizationsQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(listOrganizationsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('organization admin schemas', () => {
  it('requires a user id when promoting an admin', () => {
    expect(setOrgAdminSchema.safeParse({ userId: 'user-1' }).success).toBe(true);
    expect(setOrgAdminSchema.safeParse({}).success).toBe(false);
  });

  it('requires both ids when revoking an admin', () => {
    expect(
      adminParamsSchema.safeParse({ orgId: 'org-1', adminId: 'user-1' }).success
    ).toBe(true);
    expect(adminParamsSchema.safeParse({ orgId: 'org-1' }).success).toBe(false);
  });
});
