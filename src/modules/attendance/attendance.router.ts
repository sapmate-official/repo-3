import { Router } from 'express';
import { AttendanceController } from './attendance.controller.js';
import { authenticateUser } from '../../middleware/auth.js';
import { requireOrgScope } from '../../middleware/requireOrgScope.js';

const router = Router();

// Enforce auth & tenant scope on all attendance operations
router.use(authenticateUser, requireOrgScope());

// Punch clock (Check-in / Check-out)
router.post('/check-in', AttendanceController.checkIn);
router.post('/check-out', AttendanceController.checkOut);

// Sessions
router.get('/session/:date', AttendanceController.getSessions);
router.get('/session', AttendanceController.getSessions);

// Past days regularization & missed checkouts
router.get('/check-out/past', AttendanceController.getPastUnchecked);
router.post('/check-out/past', AttendanceController.postPastCheckOut);
router.post('/past-attendance', AttendanceController.createPastAttendance);

// Live attendance views
router.get('/live', AttendanceController.getLive);
router.get('/live/all', AttendanceController.getLive);
router.get('/manager/live/:managerId', AttendanceController.getLive);

// Verification queue & actions
router.get('/verification', AttendanceController.getVerificationQueue);
router.get('/manager/verification/:managerId', AttendanceController.getVerificationQueue);
router.get('/admin/verification/:userId', AttendanceController.getVerificationQueue);
router.patch('/:id/verify', AttendanceController.verifyAttendance);
router.post('/manager/verification', AttendanceController.verifyAttendance);
router.post('/admin/verification', AttendanceController.verifyAttendance);

// History & per-user records
router.get('/history', AttendanceController.getHistory);
router.get('/employees', AttendanceController.getHistory);
router.get('/user/:id', AttendanceController.getHistory);

// Single record deletion (for pending unverified requests)
router.delete('/:id', AttendanceController.delete);

export default router;
