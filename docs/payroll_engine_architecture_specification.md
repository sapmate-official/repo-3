# Payroll Engine Architecture Specification

## 1. System Overview
The Payroll Engine is an event-driven, asynchronous subsystem integrated into the core HR Management Portal. It transforms validated HR inputs (salary templates, attendance logs, leave approvals, tax declarations, and expense claims) into immutable monthly pay runs, statutory compliance filings, bank disbursement batches, and employee payslips.

### Core Architectural Principles
1. **Immutable Snapshotting:** At calculation time, employee salary structures, tax profiles, and attendance figures are frozen into run-specific records. Subsequent HR profile edits never alter historical payslips.
2. **Idempotency & Concurrency Control:** Pay runs are uniquely constrained by `(company_id, year, month)` and guarded by distributed locks to prevent duplicate computation or double disbursement.
3. **Strict State Machine & Maker-Checker:** State transitions are enforced at the domain service layer with Segregation of Duties (`checker_id != maker_id`).
4. **Append-Only Auditability:** All state changes, manual overrides, and statutory rule updates are recorded in an immutable audit ledger.

---

## 2. High-Level Component Architecture

```text
+-----------------------------------------------------------------------------+
|                            API Gateway / Auth (RBAC)                        |
+--------------------------------------+--------------------------------------+
                                       |
         +-----------------------------+-----------------------------+
         |                             |                             |
         v                             v                             v
+-----------------+           +-----------------+           +-----------------+
|  HR Portal Core |           | Payroll Service |           |   ESS Portal    |
| (Attendance,    |---------->| (State Machine, |           | (Payslips, Tax  |
|  Leaves, Org)   |  Internal |  Overrides,     |           |  Declarations)  |
+-----------------+   Events  |  Maker-Checker) |           +--------+--------+
                              +--------+--------+                    ^
                                       |                             |
                    +------------------+------------------+          |
                    |                                     |          |
                    v                                     v          |
           +-----------------+                   +-----------------+ |
           |   Redis Queue   |                   |   PostgreSQL    | |
           | (BullMQ/Celery) |                   | (ACID Ledger &  +-+
           +--------+--------+                   |  Audit Logs)    |
                    |                            +--------+--------+
                    v                                     ^
           +-----------------+                            |
           | Payroll Workers |----------------------------+
           | - Rule Engine   |                            |
           | - Statutory Calc|                            v
           | - PDF/ECR Gen   |                   +-----------------+
           +-----------------+                   | Object Storage  |
                                                 | (S3/MinIO PDFs, |
                                                 |  Bank Advice)   |
                                                 +-----------------+
```

---

## 3. Domain Modules & Directory Structure

```text
src/modules/payroll/
├── api/
│   ├── runs.controller.ts         # Run lifecycle, maker-checker endpoints
│   ├── structures.controller.ts   # Salary templates, pay grades, component formulas
│   ├── declarations.controller.ts # Tax regime, 80C/80D proofs, reimbursements
│   └── ess.controller.ts          # Employee payslip downloads, YTD summaries
├── domain/
│   ├── state-machine.ts           # Valid transitions & Segregation of Duties guards
│   ├── formula-evaluator.ts       # Safe AST/expression parser for CTC/Basic rules
│   ├── statutory/
│   │   ├── epf.calculator.ts      # Employee/Employer PF & EPS ceiling logic
│   │   ├── esic.calculator.ts     # Gross threshold eligibility & split rates
│   │   ├── pt.calculator.ts       # State-wise slab lookup
│   │   └── tds.calculator.ts      # Annualized tax projection (Old vs New Regime)
│   └── arrears.engine.ts          # Retrospective delta computation for backdated hikes
├── workers/
│   ├── batch-compute.worker.ts    # Chunked employee payroll calculation
│   ├── document-gen.worker.ts     # Async PDF payslip & bank NEFT/RTGS file builder
│   └── compliance-export.worker.ts# EPF ECR text file & Form 24Q generator
├── repositories/
│   ├── payroll-run.repo.ts        # Transactional queries & row-level locking
│   └── audit-log.repo.ts          # Append-only event persistence
└── events/
    └── payroll.events.ts          # Domain events (RunApproved, PayslipsReady)
```

---

## 4. Data Model (Core Entities)

```text
[salary_templates] 1---* [employee_compensations]
                                   |
                                   v (frozen snapshot at run time)
[payroll_runs] 1---* [payslip_records] 1---* [payslip_line_items]
      |                      |
      |                      +---* [payslip_overrides] (system_amt vs final_amt)
      |
      +---* [payroll_audit_logs] (immutable actor, diff, timestamp)
      +---* [disbursement_batches] (bank file checksum, UTR status)
```

### Key Table Contracts
* **`payroll_runs`**: `id`, `company_id`, `year`, `month`, `status`, `maker_id`, `checker_id`, `total_gross`, `total_deductions`, `total_net_pay`, `locked_at`, `approved_at`. *(Unique Index: `company_id, year, month`)*
* **`payslip_records`**: `id`, `run_id`, `employee_id`, `compensation_snapshot_json`, `attendance_snapshot_json`, `working_days`, `lop_days`, `gross_earnings`, `total_deductions`, `net_pay`, `payslip_pdf_url`, `has_anomaly`.
* **`payslip_line_items`**: `id`, `payslip_id`, `component_code` (`BASIC`, `HRA`, `EPF_EE`, `TDS`, etc.), `category` (`EARNING`, `DEDUCTION`, `EMPLOYER_CONTRIBUTION`, `REIMBURSEMENT`), `system_amount`, `final_amount`, `is_overridden`.
* **`payroll_audit_logs`**: `id`, `run_id`, `payslip_id` (nullable), `actor_id`, `actor_role`, `action`, `previous_state`, `new_state`, `payload_diff_json`, `reason`, `created_at`. *(Database role restricted to `INSERT` and `SELECT` only—no `UPDATE`/`DELETE`)*

---

## 5. Payroll Run State Machine

```text
   +-------+   trigger compute    +-----------+
   | DRAFT | -------------------> | COMPUTING |
   +-------+                      +-----+-----+
       ^                                |
       | retry on error                 | batch complete
       |                                v
   +--------+    reject run     +----------------+
   | FAILED | <---------------- | PENDING_REVIEW |
   +--------+    (with note)    +-------+--------+
                    ^                   |
                    |                   | maker submits
                    |                   v
                    |          +------------------+
                    +--------- | PENDING_APPROVAL |
                               +--------+---------+
                                        |
                                        | checker approves (checker != maker)
                                        v
                                  +-----------+
                                  | APPROVED  |
                                  +-----+-----+
                                        |
                                        | bank file generated & settled
                                        v
                                  +-----------+
                                  | DISBURSED | (Terminal / Immutable)
                                  +-----------+
```

### State Transition Matrix

| Current State | Allowed Actor | Permitted Actions | Target State |
| :--- | :--- | :--- | :--- |
| `DRAFT` | `HR_MAKER` | Lock attendance cut-off, pull variable pay/reimbursements, trigger batch computation. | `COMPUTING` |
| `COMPUTING` | `SYSTEM_WORKER` | Execute salary & statutory calculations per employee; flag anomalies. | `PENDING_REVIEW` or `FAILED` |
| `FAILED` | `HR_MAKER` | Inspect worker error logs, resolve data issues, retry batch computation. | `DRAFT` |
| `PENDING_REVIEW` | `HR_MAKER` | Inspect variance alerts, apply audited manual overrides, submit for approval. | `PENDING_APPROVAL` |
| `PENDING_APPROVAL` | `FINANCE_CHECKER` | Audit totals, statutory liabilities, and override diffs; approve or reject with reason. | `APPROVED` or `PENDING_REVIEW` |
| `APPROVED` | `FINANCE_CHECKER` / `SYSTEM` | Generate bank NEFT/RTGS advice files, payslip PDFs, and ECR exports; confirm payout. | `DISBURSED` |
| `DISBURSED` | `SYSTEM` (Terminal) | Read-only terminal state; unlocks Employee Self-Service (ESS) payslip visibility. | *None (Immutable)* |

### Guardrails & Invariants
* **Pre-Compute Gate (`DRAFT -> COMPUTING`):** Verifies attendance cut-off flag is locked and no pending leave/expense approvals exist for the target month.
* **Anomaly Detection (`COMPUTING -> PENDING_REVIEW`):** Flags records with missing PAN/UAN/IFSC, negative net pay, or `> 20%` net variance compared to `month - 1`.
* **Approval Gate (`PENDING_APPROVAL -> APPROVED`):** Enforces `request.user.id !== run.maker_id` and requires explicit acknowledgment if unresolved anomalies or manual overrides exist.
* **Checksum Gate (`APPROVED -> DISBURSED`):** Asserts `SUM(payslip_records.net_pay) === bank_advice_file.total_amount` before marking disbursed.

---

## 6. Security, Compliance & Operational Controls

* **Field-Level Encryption:** Encrypt bank account numbers, PAN, and Aadhaar/tax IDs at rest using envelope encryption (AES-256-GCM with KMS-managed keys); mask values (`XXXX1234`) in API responses and logs.
* **RBAC Matrix:**
  * `HR_MAKER`: Manage salary structures, initiate runs, apply overrides in `PENDING_REVIEW`.
  * `FINANCE_CHECKER`: Inspect runs, view exception diffs, approve/reject `PENDING_APPROVAL`, download bank files.
  * `EMPLOYEE`: Read-only access to own `DISBURSED` payslips and tax declaration submission.


---

## Appendix A: Simplified Architecture for Small Teams (15–20 Employees)

> **When to use:** Single-tenant deployment, 15–20 employees, no multi-tenant requirement. Skip the worker queue, distributed locks, and DLQ complexity below.

### When to Use This Mode

| Scenario | Use Simple Mode (Appendix) | Keep Full Spec |
|---|---|---|
| One company, 15–20 employees | Yes | No |
| Multi-tenant SaaS platform | No | Yes |
| < 50 employees per tenant | Yes | No (simple mode is fine) |
| 1,000+ employees per tenant | No | Yes |
| Need statutory modules for 10+ Indian jurisdictions | No | Yes |
| Manual HR approval workflow (no complex SoD) | Yes | No |

### Simplified Component Architecture

```text
+-----------------------------------------------------------------------------+
|                            HR Management Portal                             |
+-------------------------------------------+--------------------------------+
                                            |
          +-------------------------------+----------------------------------+
          |                               |                                  |
          v                               v                                  v
 +------------------+            +------------------+            +------------------+
 |  HR Portal Core  |            |  Payroll Service |            |  ESS Portal     |
 | (Attendance,     |            |  (Simple State)  |            | (Payslips, Tax  |
 |  Leaves, Org)    |            |  - calculate     |            |  Declarations)  |
 +------------------+            |  - apply taxes   |            +--------+---------+
                                   |  - generate      |                     |
                                   |    payslip PDF   |---> +------------+   |
                                   +------------------+     | PDF Storage|   |
                                                        | (local or   |   v
                                                        |  simple file)|  +----------------+
                                                        +-------------+  |  PostgreSQL     |
                                                                           | (ACID Ledger) |
                                                                           +----------------+
```

**Key removals for small teams:**
- Remove: BullMQ/Celery worker queue, Payroll Workers, Redis
- Remove: Object storage tier (S3/MinIO) — store PDFs locally or in DB
- Remove: Distributed locks (single process execution)


### Simplified State Machine

```text
    +----------+      request run      +----------+
    |  DRAFT   |---------------------->| COMPUTING|
    +----------+                       +--+-------+
       ^                                   |
       | approve (HR / Finance)            | computation done
       |                                   v
       |                        +----------+----------+ 
       |                        |     APPROVED        |
       +------------------------+                   +----+
                                     | generate bank   |
                                     v                 |
                               +-----------+           |
                               | DISBURSED | (Terminal) |
                               +-----------+            |
                                     | read-only       |
                                     v                 |
                               [ESS Portal: visible]   |
```

**State transition matrix (simplified):**

| Current State | Allowed Actor | Permitted Actions | Target State |
| :--- | :--- | :--- | :--- |
| `DRAFT` | `HR_USER` | Lock attendance cutoff, pull variable pay & reimbursements, trigger calculation | `COMPUTING` |
| `COMPUTING` | `SYSTEM_WORKER` (or synchronous service) | Execute salary & statutory calculations per employee | `PENDING_REVIEW` or `COMPLETED` |
| `PENDING_REVIEW` | `HR_USER` | Inspect variance alerts (manual), apply audited manual overrides, approve | `APPROVED` |
| `APPROVED` | `FINANCE_USER` / `SYSTEM` | Generate bank NEFT/RTGS advice file, payslip PDFs, confirm payout | `DISBURSED` |
| `DISBURSED` | `SYSTEM` (Terminal) | Read-only terminal state; unlocks ESS payslip visibility | *None (Immutable)* |

### Required Components (for Simple Mode)

| Component | Purpose | Implementation |
|---|---|---|
| `payroll.controller.ts` | Thin API layer (create run, get run, approve, disburse) | Express/Fastify route handler |
| `payroll.service.ts` | Business logic (salary calc, tax deduction, PDF generation) | Pure functions, no queues |


### Data Model (Simplified but complete)

```text
[salary_templates] 1---* [employee_compensations]
                                 |
                                 v (frozen snapshot per run)
[payroll_runs] 1---* [payslip_records] 1---* [payslip_line_items]
       |                      |
       |                      +---* [payslip_overrides]
       |
       +---* [payroll_audit_logs] (immutable)
       +---* [disbursement_batches]
```

**Key table contracts (unchanged):**

- **`payroll_runs`**: `id`, `company_id`, `year`, `month`, `status`, `maker_id`, `checker_id`, `total_gross`, `total_deductions`, `total_net_pay`, `locked_at`, `approved_at`. *(Unique Index: `company_id, year, month`)*
- **`payslip_records`**: `id`, `run_id`, `employee_id`, `compensation_snapshot_json`, `attendance_snapshot_json`, `working_days`, `lop_days`, `gross_earnings`, `total_deductions`, `net_pay`, `payslip_pdf_url`, `has_anomaly`.
- **`payroll_audit_logs`**: `id`, `run_id`, `payslip_id`, `actor_id`, `actor_role`, `action`, `previous_state`, `new_state`, `payload_diff_json`, `reason`, `created_at`. *(Database role restricted to `INSERT` and `SELECT` only)*
- **`disbursement_batches`**: `id`, `run_id`, `bank_advice_file` (JSON/bytea), `checksum`, `utr`, `status`.

### Financial & Audit Invariants (Mandatory in all modes)

1. **Financial precision:** All monetary values are `NUMERIC(14,2)` or integer paise in PostgreSQL. Workers use `decimal.js` or Python `Decimal`. Never IEEE 754 floats.
2. **Immutability:** Once `DISBURSED`, no edit to `net_pay` or any line item. Any correction creates a new run snapshot or an `APPROVED_OVERRIDE` record.
3. **Checksum gate:** `SUM(payslip_records.net_pay) === disbursement_batches.total_amount` before marking `DISBURSED`.
4. **Append-only audit:** Every state change (DRAFT→COMPUTING, COMPUTING→APPROVED, etc.) is logged as an immutable audit record.
5. **Approval separation:** `checker_id !== maker_id` enforced at the `APPROVED` transition.

### Operational Controls (Simplified)

- **Retries:** Single retry on transient failure. If it still fails, mark `FAILED` and alert the HR user to review.
- **Monitoring:** Log computation duration, total gross/net per run, and any failures to a simple log store (no distributed tracing needed for a single-tenant run).
- **Backup:** Standard PostgreSQL backups; the payroll data is not a separate backup concern.

---

> **Decision guide:** Use **Section 2–6 (the full spec)** if you are building a **multi-tenant SaaS platform** and need to serve 5-employee startups through 50,000-employee enterprises. Use **Section 7 (this appendix)** if this is a **single-company internal payroll system** for a 15–20 employee team. Both modes share the same database schema; the difference is in the workflow layer, not the data model.
| `payroll-repository.ts` | DB operations (runs, payslips, audit logs) | Prisma client (same DB as platform) |
| `audit-log.service.ts` | Append-only audit trail | `INSERT` only, `UPDATE`/`DELETE` blocked at DB level |
| `checksum.guard.ts` | Validates `SUM(net_pay) === bank_advice.total_amount` | Before marking `DISBURSED` |
| `pdf-generator.ts` | Payslip PDF generation | `pdfmake` or `puppeteer` (no object storage needed) |
- Remove: DLQ + exponential backoff (batch rarely fails; single retry is enough)