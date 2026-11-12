# ALKAA TypeScript Backend - Status and Readiness Review

- Review date: 2026-11-12
- Repository: `D:\Workspace\ALKAA\alkaa-backend-ts`
- Branch: `feature/phase4-employee-onboarding`
- HEAD: `1aba209 feat(attendance): add secure multi-session attendance module with strict hierarchy and zero duration lock`
- Scope: implementation completeness, security/authorization issues, remaining migration work, and production-readiness risks
- Review method: source inspection, route inventory, schema inspection, verification commands, comparison with `TS-MIGRATION-PLAN.md`, and comparison with frontend endpoint usage
- Source changes made by this review: none; this report is the only new file

## 1. Executive Summary

The TypeScript backend has a solid functional core, and the attendance module is the most complete and best-hardened module in the repository. Auth, organization administration, departments, employees, roles/permissions, onboarding, dashboard, and public demo intake all have working TypeScript implementations.

The backend is **not yet ready for route-by-route cutover or production traffic**. The main blockers are:

1. Critical broken access control in employee/user, role, permission, department, and onboarding routes.
2. Cross-tenant reads and writes through the v2 compatibility routes.
3. Public demo-request tenant mapping and email-template injection risks.
4. Missing financial, leave, task, holiday, notification, billing, settings, and activity-log domains.
5. No meaningful integration coverage for the newly ported modules in CI.

A reasonable status estimate is **roughly 40-50% of the full migration scope**, with the core HR/admin subset closer to **50-60%**, and the financial/payroll subset effectively **0%**. The remaining work is not just feature porting; the authorization gaps must be fixed before more routes are exposed.

## 2. Verified State

The following checks passed on the current working tree:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run lint` (`eslint . --max-warnings=0`) | Passed |
| `npm run test:unit` | 11 files, 113 tests passed |
| `npm run test:e2e` | 2 files passed, 2 skipped; 16 tests passed, 16 skipped |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |

Important limitations:

- The two skipped e2e files are the database-backed auth and organization suites. They only run when `RUN_E2E=1` and `TEST_DATABASE_URL` are set.
- There is no automated HTTP/e2e coverage for employee, role, permission, department, onboarding, or attendance behavior.
- Attendance was verified earlier with manual HTTP smoke tests; its unit tests are present, but the HTTP behavior is not in CI.
- The working tree contains uncommitted attendance changes: modified controller/schema/service and new access/time helpers plus unit tests.

## 3. Implemented Modules

| Domain | Status | Notes |
|---|---|---|
| Auth and sessions | Implemented | Mounted under `/api/v1/general` and `/api/v1/auth`; login, email check, password verification, OTP, set-password, refresh, logout, token validation, session storage, typed user/super-admin tokens, rate limiting |
| Super-admin organization administration | Implemented | Organization CRUD is protected by `authenticateSuperAdmin`; organization admin promotion/revocation uses tenant scope plus `manage_organization` |
| Organizations | Partially implemented | Core CRUD and admin management exist; organization settings, billing, plans, and charts are not ported |
| Departments | Implemented | CRUD and head assignment exist; authorization is incomplete |
| Employees/users | Implemented | CRUD, employee ID generation, role/department assignment, imported bank/salary fields; authorization and data-integrity gaps remain |
| Roles | Implemented | Role CRUD, user-role assignment, role-permission add/remove; hierarchy endpoints are stubs |
| Permissions | Implemented | Global permission CRUD and listing; mutation routes are not restricted to super-admins |
| Attendance | Implemented, strongest module | Check-in/check-out, sessions, live/history, regularization, verification, deletion; custom self/manager/admin access checks; unit tests and manual smoke verification |
| Onboarding | Implemented | Public candidate token flow, invitation, review, document verification, approval/rejection, completion/provisioning; protected routes lack role/permission guards |
| Dashboard | Implemented | Basic adaptive summary plus v1/v2 compatibility routes |
| Public | Partially implemented | Demo-request intake only; tenant mapping and email safety are not production-ready |
| Email | Implemented as a service | Brevo-based demo, invitation, approval, and welcome emails; HTML escaping is missing |

## 4. Remaining Migration Work

### 4.1 Domains still missing from TypeScript

The frontend still points these domains at the legacy backend (`APIDictionary` / `APIV3Dictionary`):

- Leave types, leave requests, leave approvals, leave balances
- Payroll, salary records, salary generation, payslips, payroll statistics
- Bank details as a standalone module
- Notifications, push subscriptions, WhatsApp notifications
- Task management, task groups, task assignments, task updates
- Holidays and holiday types
- Subscription plans and billing
- Organization settings
- Permission presets
- Activity logs
- Relationships and organization charts
- Events and birthday emails
- Super-admin account CRUD, platform statistics, and billing management

Some pieces are partially present inside other modules:

- Bank details are written during employee creation/update, but there is no standalone bank API.
- Email notifications exist, but there is no notification API.
- Activity-log and task-related Prisma models exist, but no routes or services serve them.

### 4.2 Phase status against `TS-MIGRATION-PLAN.md`

| Phase | Status |
|---|---|
| Phase 0 - Preparation | Partial; route inventory and docs exist in the migration plan, but this repo has no README and the legacy audit document is stale |
| Phase 1 - Secure core | Partial; env validation, CORS, helmet, request IDs, rate limits, typed tokens, and error handling exist |
| Phase 2 - Auth | Implemented |
| Phase 3 - Super-admin | Partial; organization admin routes are protected, but super-admin account CRUD/platform stats/billing are missing |
| Phase 4 - Org context and RBAC | Implemented but insecure; authorization guards are missing on many routes |
| Phase 5 - Financial modules | Not started in TypeScript |
| Phase 6 - Attendance, leave, employees | Attendance and employees are implemented; leave is missing |
| Phase 7 - Onboarding and public | Implemented, but needs authorization and public-intake hardening |
| Phase 8 - Remaining routes and hardening | Not started |
| Phase 9 - Parity and shadow testing | Not started |
| Phase 10 - Canary and cutover | Not started |
| Phase 11 - Decommission | Not started |

### 4.3 Rough completeness estimate

- Legacy route inventory: about 323 route definitions across the legacy v1/v2/v3 routers.
- TypeScript route inventory: about 127 route definitions, including compatibility aliases and duplicated mounts.
- Raw endpoint coverage is therefore around 39%, but aliases inflate the TypeScript count, so true business-rule parity is lower.
- About 9 functional domains have TypeScript endpoints; at least 10 legacy domains have none.
- Estimated remaining work for one developer, assuming no major schema surprises:
  - 4-6 weeks to port the remaining business domains
  - 1-2 weeks to close authorization gaps and add integration/security tests
  - additional time for parity testing, shadow traffic, canary, and cutover

This is consistent with the migration plan's 12-week timeline. The project is currently around the end of the core-module phase, not near cutover.

## 5. Critical Findings

### C1. Role and permission routes allow privilege escalation by any authenticated employee

Evidence:

- `src/modules/role/role.router.ts:9-28` applies only `authenticateAny`.
- `src/modules/role/userRole.router.ts:7-12` applies only `authenticateAny`.
- `src/modules/role/rolePermission.router.ts` applies only `authenticateAny`.
- `src/modules/permission/permission.router.ts:10-19` protects global permission mutations with authentication only.

Impact:

- Any employee can create, update, or delete roles in their organization.
- Any employee can assign roles to any user, including themselves.
- Any employee can add permissions to a role, including their own role.
- Any authenticated user can mutate global permission definitions, affecting every tenant.

Fix:

- Require `manage_roles` / `manage_permissions` on all role and permission mutations.
- Restrict global permission CRUD to `authenticateSuperAdmin`.
- Prevent self-assignment of elevated roles unless the actor already holds the required permission.
- Add regression tests proving a normal employee receives `403` on each mutation.

### C2. v2 compatibility routes expose cross-tenant employee data and allow cross-tenant writes

Evidence:

- `src/routes/v2.ts:34-37` exposes organization employee-list and employee-ID routes with only `authenticateAny`.
- `src/routes/v2.ts:60-76` exposes user-list, user detail, user update/delete, role replacement, department assignment, and user creation with only `authenticateAny`.
- `src/modules/employee/employee.controller.ts:17,36,54,73,87,103,121` resolves `orgId` from path, query, or body before falling back to the authenticated user's organization.
- `src/modules/employee/employee.controller.ts:121` accepts `body.orgId` for employee creation.
- `src/routes/v1.ts:49-50` exposes legacy employee-list and employee-register routes with only `authenticateAny`.

Impact:

- `GET /api/v2/organization/employee-list/:orgId` can read another tenant's employee roster.
- `GET /api/v2/user/org/:orgId?orgId=...` and `/api/v2/user/user-list?orgId=...` can read another tenant's employee data.
- `GET /api/v2/user/:id?orgId=...` can read another tenant's employee record.
- `GET /api/v2/user/:id/permissions?orgId=...` can read another tenant's permission data.
- `POST /api/v2/user` and `POST /api/v1/employee/register` can create users in an arbitrary organization by supplying `orgId` in the body.
- Any employee in an organization can update or delete any other employee in that organization, including status, manager, department, roles, salary, and bank details.

Fix:

- Remove client-supplied `orgId` from tenant routes. Derive it from `req.user.orgId`.
- Apply `requireOrgScope()` to every compatibility route that accepts an organization identifier.
- Add `requirePermission(...)` or a role guard to all employee/user administration operations.
- Decide explicitly whether normal employees may list colleagues; if yes, expose a restricted directory DTO, not full HR records.

### C3. Onboarding exposes candidate PII and workflow actions to any employee

Evidence:

- `src/modules/onboarding/onboarding.router.ts:20-37` protects routes with `authenticateAny` and `requireOrgScope()` only.

Impact:

- Any employee can list onboarding candidates, read review data, read candidate records, create candidates, send invitations, edit/delete candidates, verify documents, approve/reject candidates, and complete onboarding.
- Candidate data includes personal and identity information, so this is a PII exposure and an HR workflow integrity issue.

Fix:

- Require onboarding/HR permissions on all protected onboarding routes.
- Separate read-only reviewer access from approve/complete/provision access.
- Add tenant and actor checks in the service, not only middleware.

### C4. Public demo-request endpoint can write candidates into the wrong tenant and can update existing candidates across tenants

Evidence:

- `src/modules/public/public.router.ts:19-46` matches an organization by company name or by a hardcoded `shapenxt` user email, then falls back to the first organization with any user.
- `src/modules/public/public.router.ts` updates an existing candidate by global email lookup.

Impact:

- A public request can create a candidate in the wrong organization.
- A public request using an existing candidate's email can update that candidate's name, phone number, status, and form data without proving ownership or tenant context.
- The endpoint has no public rate limiter, so it can be abused for spam or data pollution.

Fix:

- Require an explicit, trusted tenant identifier or use a dedicated platform intake queue that is not owned by a tenant.
- Do not update an existing candidate based solely on an email supplied by an unauthenticated caller.
- Apply a strict public rate limit.
- Add abuse tests for duplicate emails, unknown companies, and repeated submissions.

### C5. Public and onboarding emails interpolate untrusted values into HTML without escaping

Evidence:

- `src/services/email.service.ts:93-100` and `125-128` interpolate demo-request `name`, `company`, `phoneNumber`, and `email` into HTML.
- `src/services/email.service.ts:158-171`, `201-207`, and `234-240` interpolate candidate and employee values into HTML.

Impact:

- An attacker can inject HTML/phishing content into emails sent to internal staff or candidates.
- This is the same class of issue identified in the legacy security audit and is not fixed in the TypeScript rewrite.

Fix:

- HTML-escape every untrusted value before interpolation.
- Prefer a templating system with auto-escaping.
- Validate URL/email fields used in `href` attributes.

## 6. High Findings

### H1. Department mutations have no role or permission guard

Evidence:

- `src/modules/department/department.router.ts:30-41` applies `requireOrgScope()` but no `requirePermission(...)` or role check.

Impact:

- Any employee can create, rename, reassign the head of, or delete departments in their organization.

Fix:

- Require an HR/admin permission such as `manage_departments` for mutations.
- Consider restricting department head changes to organization admins.

### H2. Employee update does not validate role IDs against the organization

Evidence:

- `src/modules/employee/employee.service.ts:419-427` deletes all existing roles and inserts the supplied `roleIds` without checking that those roles belong to the same organization.
- Employee creation does validate roles at `src/modules/employee/employee.service.ts:264-270`, but update does not.

Impact:

- A user can be linked to a role from another tenant.
- Because authorization reads permissions from assigned roles, this can leak permissions across tenants or corrupt tenant role semantics.

Fix:

- Validate every role ID against `orgId` before deleting existing assignments.
- Reject the request if any role ID is invalid or belongs to another tenant.
- Add a transaction-level test for this case.

### H3. Employee deletion is likely to fail for employees with attendance, leave, salary, or task history

Evidence:

- `src/modules/employee/employee.service.ts:521-536` deletes only user roles, bank details, salary parameters, leave balances, organization admin links, auth sessions, and OTP records, then hard-deletes the user.
- Required Prisma relations such as `AttendanceRecord.user`, `LeaveRequest.user`, `SalaryRecord.user`, `Notification.user`, `Task.createdBy`, `TaskAssignment.assignedTo`, `ActivityLog.actor`, and `PushSubscription.user` do not have `onDelete: Cascade`.

Impact:

- Deleting an employee with normal HR history will likely produce a foreign-key error and a 500 response.
- If relations are changed later without a retention policy, historical payroll/attendance records could be destroyed.

Fix:

- Prefer soft deletion/deactivation for employees with history.
- If hard deletion is required, define an explicit retention and anonymization policy.
- Clean up or reassign every dependent record in one transaction.
- Add a test with attendance and leave records.

### H4. Employee creation returns temporary credentials in the API response and does not send them

Evidence:

- `src/modules/employee/employee.service.ts:272-276` generates a temporary password and verification token.
- `src/modules/employee/employee.service.ts:371-372` returns both `temporaryPassword` and `verificationToken`.
- `createEmployee` does not call the welcome email service, although `EmailService.sendNewEmployeeWelcomeEmail` exists.

Impact:

- Credentials are exposed to any caller authorized to create employees, including potentially an employee-level caller because employee creation lacks a role guard.
- The intended secure delivery path is not used.

Fix:

- Send credentials through the existing welcome-email flow.
- Do not return the plaintext temporary password or verification token in the API response unless there is a documented, audited admin flow.
- Require an admin/HR permission for employee creation.

### H5. The permission guard has a broad organization-admin bypass and is not applied consistently

Evidence:

- `src/middleware/requirePermission.ts:27-32` allows `Org_Admin` to bypass every permission key.
- Most sensitive routes do not use `requirePermission` at all.

Impact:

- Permission keys are not a reliable authorization boundary.
- The current model effectively has two states: organization admin or unguarded.

Fix:

- Decide whether `Org_Admin` should bypass all permissions. If yes, document it and still require the guard on every sensitive route.
- If not, remove the bypass and seed the required permissions for organization admins.
- Add a route-by-route authorization matrix and test it.

### H6. Database-backed e2e tests skip by default, leaving ported modules untested in CI

Evidence:

- `.github/workflows/ci.yml:51-52` runs `npm run test:e2e` without `RUN_E2E=1` or `TEST_DATABASE_URL`.
- The auth and organization e2e suites call `describe.skip` in that case.

Impact:

- CI does not exercise login, organization admin, tenant isolation, or any database-backed behavior.
- The most security-sensitive flows are validated only by unit tests and manual smoke tests.

Fix:

- Add an ephemeral test database (for example a Neon branch) to CI.
- Run database e2e tests for auth, organization, employee, role, onboarding, and attendance.
- Add explicit negative tests for cross-tenant access and privilege escalation.

### H7. CI environment names do not match the required production environment

Evidence:

- `.github/workflows/ci.yml:23-25` sets `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SUPER_ADMIN_JWT_SECRET`.
- `src/config/env.ts` requires `USER_ACCESS_TOKEN_SECRET`, `USER_REFRESH_TOKEN_SECRET`, `SUPER_ADMIN_ACCESS_TOKEN_SECRET`, `SUPER_ADMIN_REFRESH_TOKEN_SECRET`, and `OTP_HASH_SECRET`.
- `test/setup.ts` supplies fallback values, so tests pass without validating the real environment contract.

Impact:

- CI does not prove that a deployment with production-style environment variables can boot.
- A deployment that copies the CI environment names will fail at startup.

Fix:

- Use the real environment variable names in CI and a separate `.env.example`.
- Add a startup smoke test that validates the environment schema.
- Remove test fallbacks from any production-like check.

## 7. Medium and Low Findings

### M1. Role hierarchy endpoints are placeholders

- `src/modules/role/role.controller.ts:121-126` returns an empty hierarchy and a no-op update.
- Any frontend expecting real hierarchy behavior will get a misleading success response.

### M2. v2 auth is not mounted

- Auth is available under `/api/v1/general` and `/api/v1/auth`.
- `/api/v2/auth/*` returns `404`.
- The current frontend uses v1, so this is not an immediate break, but it is an API-parity gap for legacy clients.

### M3. Frontend attendance update endpoint is broken

- `Alkaa-frontend/src/services/api/attendanceApi.ts` calls `PUT /attendance/:id`.
- The TypeScript attendance router has no `PUT /:id`; it has `PATCH /:id/verify` and `DELETE /:id`.
- The current UI may not call this path, but the service contract is stale.

### M4. Permission visibility may depend on unverified seeded permissions

- Attendance role checks fall back to role names, so current behavior works.
- Frontend visibility may still depend on `view_all_user_attendance` / `view_subordinates_attendance` being seeded in the live database.
- This should be verified against a fresh database seed.

### M5. Only the initial migration exists

- `prisma/migrations/20261106000000_init` is the only migration.
- The repository has no shadow database configured in `prisma.config.ts`, so migration drift cannot be checked with `prisma migrate diff --from-migrations`.
- Add a migration verification step before cutover.

### M6. Legacy audit document is stale

- `docs/LEGACY_BACKEND_ISSUES_AUDIT.md` still says employee endpoints are not ported.
- Employee, department, role, attendance, and onboarding modules now exist.
- Treat the document as a historical issue registry, not a current status report.

### M7. No README or operational runbook

- There is no backend `README.md`.
- Missing documentation includes local setup, environment variables, seeding, migration procedure, test database setup, deployment, rollback, and route ownership.

### M8. `requireOrgScope` is a tenant boundary, not an authorization boundary

- It prevents a normal user from supplying another `orgId`.
- It does not check whether the user is allowed to perform the operation inside their own organization.
- Do not treat `requireOrgScope()` alone as sufficient protection for sensitive routes.

## 8. Production-Readiness Assessment

| Area | Assessment |
|---|---|
| Build/type/lint | Ready |
| Auth token handling | Mostly ready; deploy-time env contract needs validation |
| Tenant isolation | Not ready; v2 compatibility routes leak across tenants |
| Object-level authorization | Not ready; employee/user/onboarding/department/role routes are open to authenticated employees |
| Global RBAC administration | Not ready; permission mutations are available to any authenticated user |
| Financial modules | Not implemented |
| Leave/workflow modules | Not implemented |
| Background jobs/notifications | Not implemented |
| Audit logging | Model exists, no API or automatic writes |
| Test coverage | Good unit coverage for selected utilities; insufficient integration coverage |
| Documentation | Incomplete and partly stale |
| Cutover readiness | Not ready; Phases 8-11 have not started |

## 9. Recommended Order of Work

1. Fix authorization on all existing mutation routes before adding more features:
   - role/user-role/role-permission
   - permission CRUD
   - employee/user administration
   - department mutations
   - onboarding workflow
2. Remove tenant IDs from request input for tenant operations; derive them from `req.user.orgId`.
3. Fix the v2 compatibility routes or disable them until they are safe.
4. Harden public demo intake and escape all email HTML.
5. Fix employee update role validation and employee deletion semantics.
6. Add database-backed integration tests for auth, organization, employee, role, onboarding, and attendance.
7. Port the remaining domains in dependency order: leave, holidays, bank, notifications, tasks, payroll/salary, settings, permission presets, activity logs, billing/subscriptions, super-admin account management.
8. Add migration verification, a README/runbook, and a route authorization matrix.
9. Run parity/shadow testing, then canary/cutover.

## 10. Bottom Line

The rewritten backend is genuinely functional and has a strong attendance implementation, but the current route surface is too permissive to expose. The highest-value next step is not another module; it is a security pass over the existing routes, followed by CI-backed authorization regression tests. After that, the remaining domain work can proceed with a clear tenant and RBAC model.
