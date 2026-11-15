import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const leaveServiceMock = vi.hoisted(() => ({
  listOrganizationRequests: vi.fn(),
  getLeaveRequest: vi.fn(),
  createLeaveRequest: vi.fn(),
  updateLeaveRequest: vi.fn(),
  deleteLeaveRequest: vi.fn(),
  listUserRequests: vi.fn(),
  listManagerRequests: vi.fn(),
  approveLeaveRequest: vi.fn(),
  rejectLeaveRequest: vi.fn(),
  cancelLeaveRequest: vi.fn(),
  listUserBalances: vi.fn(),
  listBalances: vi.fn(),
  getBalanceById: vi.fn(),
  getBalanceForTypeAndUser: vi.fn(),
  createBalance: vi.fn(),
  updateBalance: vi.fn(),
  deleteBalance: vi.fn()
}));

vi.mock('../../src/modules/leave/leave.service.js', () => ({
  LeaveService: leaveServiceMock
}));

import {
  LeaveBalanceController,
  LeaveRequestController
} from '../../src/modules/leave/leave.controller.js';

describe('Leave Controller Legacy & Routing Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res = {} as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    res.send = vi.fn().mockReturnValue(res);
    return res;
  };

  const sampleActor = {
    id: 'user-manager-1',
    orgId: 'org-test-1',
    roles: ['Manager'],
    permissions: ['view_subordinates_leave'],
    isSuperAdmin: false
  };

  describe('LeaveRequestController.respondLegacy', () => {
    it('approves a request using body.leaveRequestId and uppercase APPROVED status', async () => {
      const req = {
        body: {
          leaveRequestId: 'leave-101',
          status: 'APPROVED'
        },
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.approveLeaveRequest.mockResolvedValueOnce({
        id: 'leave-101',
        status: 'APPROVED'
      });

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(leaveServiceMock.approveLeaveRequest).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'leave-101'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'leave-101', status: 'APPROVED' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('approves a request using body.id and lowercase approve status', async () => {
      const req = {
        body: {
          id: 'leave-102',
          status: 'approve'
        },
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.approveLeaveRequest.mockResolvedValueOnce({
        id: 'leave-102',
        status: 'APPROVED'
      });

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(leaveServiceMock.approveLeaveRequest).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'leave-102'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a request with body.leaveRequestId and rejectedReason', async () => {
      const req = {
        body: {
          leaveRequestId: 'leave-103',
          status: 'REJECTED',
          rejectedReason: 'Team capacity exceeded'
        },
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.rejectLeaveRequest.mockResolvedValueOnce({
        id: 'leave-103',
        status: 'REJECTED',
        rejectedReason: 'Team capacity exceeded'
      });

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(leaveServiceMock.rejectLeaveRequest).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'leave-103',
        'Team capacity exceeded'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a request with fallback to body.reason', async () => {
      const req = {
        body: {
          id: 'leave-104',
          status: 'reject',
          reason: 'Project delivery deadline'
        },
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.rejectLeaveRequest.mockResolvedValueOnce({
        id: 'leave-104',
        status: 'REJECTED',
        rejectedReason: 'Project delivery deadline'
      });

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(leaveServiceMock.rejectLeaveRequest).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'leave-104',
        'Project delivery deadline'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects a request with fallback to default reason when omitted', async () => {
      const req = {
        body: {
          leaveId: 'leave-104b',
          status: 'REJECTED'
        },
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.rejectLeaveRequest.mockResolvedValueOnce({
        id: 'leave-104b',
        status: 'REJECTED',
        rejectedReason: 'Rejected by manager'
      });

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(leaveServiceMock.rejectLeaveRequest).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'leave-104b',
        'Rejected by manager'
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });

    it('passes error to next when leave request id is missing', async () => {
      const req = {
        body: { status: 'APPROVED' },
        params: {},
        query: {},
        headers: {},
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
        code: 'LEAVE_REQUEST_ID_REQUIRED'
      });
    });

    it('passes error to next when status is invalid', async () => {
      const req = {
        body: { leaveRequestId: 'leave-105', status: 'PENDING' },
        params: {},
        query: {},
        headers: {},
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      await LeaveRequestController.respondLegacy(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
        code: 'INVALID_LEAVE_STATUS'
      });
    });
  });

  describe('LeaveRequestController.listByUser fallback resolution', () => {
    it('uses req.params.id when provided', async () => {
      const req = {
        params: { id: 'user-employee-1' },
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listUserRequests.mockResolvedValueOnce([]);

      await LeaveRequestController.listByUser(req, res, next);

      expect(leaveServiceMock.listUserRequests).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'user-employee-1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to req.params.userId when id is absent', async () => {
      const req = {
        params: { userId: 'user-employee-2' },
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listUserRequests.mockResolvedValueOnce([]);

      await LeaveRequestController.listByUser(req, res, next);

      expect(leaveServiceMock.listUserRequests).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'user-employee-2'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to req.user.id for legacy employee routes without params', async () => {
      const req = {
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listUserRequests.mockResolvedValueOnce([]);

      await LeaveRequestController.listByUser(req, res, next);

      expect(leaveServiceMock.listUserRequests).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        sampleActor.id
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('LeaveRequestController.listByManager fallback resolution', () => {
    it('uses req.params.id when provided', async () => {
      const req = {
        params: { id: 'manager-1' },
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listManagerRequests.mockResolvedValueOnce([]);

      await LeaveRequestController.listByManager(req, res, next);

      expect(leaveServiceMock.listManagerRequests).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'manager-1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to req.user.id for legacy manager route without params', async () => {
      const req = {
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listManagerRequests.mockResolvedValueOnce([]);

      await LeaveRequestController.listByManager(req, res, next);

      expect(leaveServiceMock.listManagerRequests).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        sampleActor.id
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('LeaveBalanceController.listByUser fallback resolution', () => {
    it('uses req.params.userId when provided', async () => {
      const req = {
        params: { userId: 'user-employee-1' },
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listUserBalances.mockResolvedValueOnce([]);

      await LeaveBalanceController.listByUser(req, res, next);

      expect(leaveServiceMock.listUserBalances).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        'user-employee-1'
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to req.user.id for legacy employee balance route without params', async () => {
      const req = {
        params: {},
        query: {},
        headers: { 'x-org-id': 'org-test-1' },
        user: sampleActor
      } as unknown as Request;
      const res = mockRes();
      const next = vi.fn() as NextFunction;

      leaveServiceMock.listUserBalances.mockResolvedValueOnce([]);

      await LeaveBalanceController.listByUser(req, res, next);

      expect(leaveServiceMock.listUserBalances).toHaveBeenCalledWith(
        sampleActor,
        'org-test-1',
        sampleActor.id
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
