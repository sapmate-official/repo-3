import { prisma } from '../db/prisma.js';
import { DepartmentService } from '../modules/department/department.service.js';
import { EmployeeService } from '../modules/employee/employee.service.js';
import { OnboardingService } from '../modules/onboarding/onboarding.service.js';

async function runPhase4Verification() {
  console.log('--- PHASE 4: VERIFICATION TEST ---');

  // 1. Get an existing user and their organization
  const adminUser = await prisma.user.findFirst({
    include: { organization: true }
  });

  if (!adminUser) {
    throw new Error('No user found in DB');
  }

  const org = adminUser.organization;
  const orgId = org.id;
  console.log(`[1] Found organization: ${org.name} (${orgId}) with admin user: ${adminUser.email}`);

  // 2. Test Department Service
  console.log('\n[2] Testing DepartmentService...');
  const departments = await DepartmentService.listDepartments(orgId);
  console.log(`✓ Departments listed: count = ${departments.length}`);

  let testDept: any = departments[0];
  if (!testDept) {
    testDept = await DepartmentService.createDepartment(orgId, {
      name: 'Engineering QA',
      code: 'ENG-QA',
      description: 'Test Department'
    });
    console.log(`✓ Created test department: ${testDept.name}`);
  } else {
    console.log(`✓ Using existing department: ${testDept.name} (${testDept.id})`);
  }

  // 3. Test Employee Service
  console.log('\n[3] Testing EmployeeService...');
  const employeeResult = await EmployeeService.listEmployees(orgId, {
    page: 1,
    limit: 10,
    sortBy: 'firstName',
    sortOrder: 'asc'
  });
  console.log(`✓ Employee pagination working: total = ${employeeResult.pagination.total}, returned = ${employeeResult.data.length}`);

  if (employeeResult.data.length > 0) {
    const firstEmp: any = employeeResult.data[0];
    const fullProfile = await EmployeeService.getEmployeeById(orgId, firstEmp.id);
    console.log(`✓ 7-tab Employee Profile fetched successfully for: ${fullProfile.name} (Role: ${fullProfile.roles?.[0]?.role?.name})`);
  }

  const checkResult = await EmployeeService.checkEmployeeId(orgId, 'SHAP2601001');
  console.log(`✓ Employee ID availability check working: ${JSON.stringify(checkResult)}`);

  // 4. Test Onboarding Workflow
  console.log('\n[4] Testing Onboarding Lifecycle...');
  const testCandidateEmail = `test.candidate.${Date.now()}@example.com`;

  const createdCandidate = await OnboardingService.createCandidate(orgId, adminUser.id, {
    email: testCandidateEmail,
    firstName: 'Test',
    lastName: 'Candidate',
    mobileNumber: '+919876543210',
    jobTitle: 'QA Engineer',
    departmentId: testDept.id,
    annualPackage: 600000
  });
  console.log(`✓ Step 1: Candidate invited with token (${createdCandidate.id})`);

  const token = createdCandidate.verificationToken!;
  const verified = await OnboardingService.verifyCandidateToken(token);
  console.log(`✓ Step 2: Public token verified for ${verified.firstName} ${verified.lastName}`);

  const submitted = await OnboardingService.submitCandidateForm(token, {
    address: '123 Tech Park, Bengaluru',
    dateOfBirth: '1998-05-15',
    panNumber: 'ABCDE1234F',
    adharNumber: '123456789012',
    bankDetails: {
      accountHolderName: 'Test Candidate',
      accountNumber: '987654321098',
      ifscCode: 'HDFC0001234',
      bankName: 'HDFC Bank'
    }
  });
  console.log(`✓ Step 3: Candidate submitted onboarding form (Status: ${submitted.status})`);

  const underReview = await OnboardingService.markUnderReview(orgId, createdCandidate.id, adminUser.id);
  console.log(`✓ Step 4: Marked under review (Status: ${underReview.status})`);

  const reviewData = await OnboardingService.getCandidateReviewData(orgId, createdCandidate.id);
  console.log(`✓ Step 5: Review data structured for HR console (Candidate: ${reviewData.data.candidateInfo.firstName}, Bank: ${reviewData.data.submittedData.bankDetails?.bankName})`);

  const docAudit = await OnboardingService.verifyDocument(orgId, createdCandidate.id, adminUser.id, 'panCard', 'VERIFIED');
  console.log(`✓ Step 6: Document verification audit stored`);

  const approved = await OnboardingService.approveCandidate(orgId, createdCandidate.id, adminUser.id, {
    jobTitle: 'Lead QA Engineer'
  });
  console.log(`✓ Step 7: Candidate approved by HR (Status: ${approved.status})`);

  // Clean up candidate
  await OnboardingService.deleteCandidate(orgId, createdCandidate.id);
  console.log(`✓ Step 8: Cleaned up test candidate`);

  console.log('\n--- ALL PHASE 4 TESTS PASSED CLEANLY! ---');
}

runPhase4Verification()
  .catch((err) => {
    console.error('Phase 4 verification failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
