/**
 * @file mockStore.js
 * @description Comprehensive in-memory mock data store for Master Multi-Vendor Survey, Audit & Verification CRM.
 * Provides realistic demo data and CRUD operations when PostgreSQL database is offline or unreachable.
 */

const { v4: uuidv4 } = require('uuid');
const { AuthorizationError, NotFoundError } = require('../utils/errors');

// ============================================================================
// CONSTANTS & IDS
// ============================================================================

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const CLIENT_1_ID = '22222222-2222-2222-2222-222222222221';
const CLIENT_2_ID = '22222222-2222-2222-2222-222222222222';

const VENDOR_1_ID = '33333333-3333-3333-3333-333333333331';
const VENDOR_2_ID = '33333333-3333-3333-3333-333333333332';
const VENDOR_3_ID = '33333333-3333-3333-3333-333333333333';
const VENDOR_4_ID = '33333333-3333-3333-3333-333333333334';
const VENDOR_5_ID = '33333333-3333-3333-3333-333333333335';

const PROJECT_1_ID = '44444444-4444-4444-4444-444444444441';
const PROJECT_2_ID = '44444444-4444-4444-4444-444444444442';

const ROLE_MASTER_ADMIN_ID = '55555555-5555-5555-5555-555555555501';
const ROLE_CLIENT_ADMIN_ID = '55555555-5555-5555-5555-555555555502';
const ROLE_VENDOR_ADMIN_ID = '55555555-5555-5555-5555-555555555503';
const ROLE_PM_ID = '55555555-5555-5555-5555-555555555504';
const ROLE_CATI_AGENT_ID = '55555555-5555-5555-5555-555555555505';
const ROLE_CAPI_AUDITOR_ID = '55555555-5555-5555-5555-555555555506';
const ROLE_SUPER_AUDITOR_ID = '55555555-5555-5555-5555-555555555507';
const ROLE_TVC_AGENT_ID = '55555555-5555-5555-5555-555555555508';
const ROLE_FA_AGENT_ID = '55555555-5555-5555-5555-555555555509';
const ROLE_EXAM_AGENT_ID = '55555555-5555-5555-5555-555555555510';
const ROLE_VIEWER_ID = '55555555-5555-5555-5555-555555555511';

// Pre-hashed passwords for test accounts:
// 'admin123' -> $2a$10$U/kCrJI51YbHzNbRHlOBS.0Fs9VgLrbDwqH9FzUYJI9CsAVIoxuVS
// 'password123' -> $2a$10$k/D/wCK.og1OtkPkPNx76O7INoqsIPyEEEmEJfEcRP5CZxtQFZPOO
const HASH_ADMIN = '$2a$10$U/kCrJI51YbHzNbRHlOBS.0Fs9VgLrbDwqH9FzUYJI9CsAVIoxuVS';
const HASH_PASS = '$2a$10$k/D/wCK.og1OtkPkPNx76O7INoqsIPyEEEmEJfEcRP5CZxtQFZPOO';

const USER_ADMIN_ID = '66666666-6666-6666-6666-666666666601';
const USER_CLIENT_ID = '66666666-6666-6666-6666-666666666602';
const USER_VENDOR_ID = '66666666-6666-6666-6666-666666666603';
const USER_PM_ID = '66666666-6666-6666-6666-666666666604';
const USER_CATI_ID = '66666666-6666-6666-6666-666666666605';
const USER_CAPI_ID = '66666666-6666-6666-6666-666666666606';
const USER_SUPER_ID = '66666666-6666-6666-6666-666666666607';
const USER_TVC_ID = '66666666-6666-6666-6666-666666666608';
const USER_FA_ID = '66666666-6666-6666-6666-666666666609';

const QV_1_ID = '77777777-7777-7777-7777-777777777701';
const QV_2_ID = '77777777-7777-7777-7777-777777777702';

const SEC_1_ID = '77777777-7777-7777-7777-777777778801';
const SEC_2_ID = '77777777-7777-7777-7777-777777778802';
const SEC_3_ID = '77777777-7777-7777-7777-777777778803';

const Q_AGE_ID = '88888888-8888-8888-8888-888888880001';
const Q_GEN_ID = '88888888-8888-8888-8888-888888880002';
const Q_VOTE_ID = '88888888-8888-8888-8888-888888880003';
const Q_ISSUE_ID = '88888888-8888-8888-8888-888888880004';
const Q_RATE_ID = '88888888-8888-8888-8888-888888880005';

const INDIAN_FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan',
  'Shaurya', 'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Pari', 'Kiara', 'Riya', 'Myra', 'Anushka',
  'Ramesh', 'Suresh', 'Deepak', 'Manish', 'Kavita', 'Sunita', 'Rekha', 'Pooja', 'Rahul', 'Rohit'
];
const INDIAN_LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Yadav', 'Malhotra', 'Gupta', 'Singh', 'Deshmukh', 'Saxena', 'Kumar',
  'Das', 'Chatterjee', 'Banerjee', 'Mishra', 'Reddy', 'Chauhan', 'Tiwari', 'Pandey', 'Nair', 'Iyer'
];
const SAMPLE_STATES = ['UP', 'MH', 'BR', 'WB', 'DL'];

const generateInitialCampaignLeads = (count = 65, projectId = PROJECT_1_ID) => {
  const leads = [];
  for (let i = 1; i <= count; i++) {
    const fn = INDIAN_FIRST_NAMES[(i - 1) % INDIAN_FIRST_NAMES.length];
    const ln = INDIAN_LAST_NAMES[(i - 1) % INDIAN_LAST_NAMES.length];
    const state = SAMPLE_STATES[(i - 1) % SAMPLE_STATES.length];
    leads.push({
      id: `lead-c1-${String(i).padStart(4, '0')}`,
      project_id: projectId,
      vendor_id: null, // Initially unassigned pending pool
      assigned_agent_id: null,
      respondent_name: `${fn} ${ln}`,
      phone_number: `+91-98${String(10000000 + i).slice(0, 8)}`,
      state,
      constituency: `AC-${100 + (i % 25)}`,
      status: 'PENDING',
      priority: 50 + (i % 30),
      attempt_count: 0,
      metadata: JSON.stringify({ source: 'Election_Roll_Import_2026', sampleWave: 1 }),
      allocated_at: null,
      surveyed_at: null,
      created_at: new Date('2026-02-15T10:00:00Z'),
      updated_at: new Date('2026-02-15T10:00:00Z'),
    });
  }
  return leads;
};

// ============================================================================
// IN-MEMORY COLLECTIONS
// ============================================================================

const store = {
  // 1. Tenancy
  organizations: [
    {
      id: ORG_ID,
      name: 'PollyPulse Insights & Analytics Ltd.',
      code: 'POLLYPULSE',
      slug: 'pollypulse-analytics',
      is_active: true,
      status: 'ACTIVE',
      max_created_users: 200,
      max_concurrent_human_seats: 5,
      audit_ai_licenses: 2,
      voice_ai_licenses: 1,
      enable_ai_audit: true,
      enabled_modules: ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'],
      license_status: 'ACTIVE',
      license_validity_start: '2026-01-01',
      license_validity_end: '2027-01-01',
      admin_name: 'Vikram Malhotra',
      admin_email: 'orgadmin@mastercrm.com',
      admin_phone: '+91-9876543210',
      settings: JSON.stringify({ timezone: 'Asia/Kolkata', currency: 'INR', autoSuperAuditPercent: 10 }),
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],

  clients: [
    {
      id: CLIENT_1_ID,
      organization_id: ORG_ID,
      name: 'Public Policy Research Foundation',
      code: 'PPRF',
      email: 'contact@pprf.org',
      phone: '+91-11-23456789',
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: CLIENT_2_ID,
      organization_id: ORG_ID,
      name: 'Global Governance Center',
      code: 'GGC',
      email: 'info@ggc.org',
      phone: '+91-11-98765432',
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date(),
    },
  ],

  vendors: [
    { id: VENDOR_1_ID, organization_id: ORG_ID, name: 'Apex Field Operations Agency', code: 'APEX', email: 'ops@apex.in', phone: '+91-9811000001', status: 'ACTIVE', created_at: new Date() },
    { id: VENDOR_2_ID, organization_id: ORG_ID, name: 'Beacon Data Services', code: 'BEACON', email: 'ops@beacon.in', phone: '+91-9811000002', status: 'ACTIVE', created_at: new Date() },
    { id: VENDOR_3_ID, organization_id: ORG_ID, name: 'Crest Telephony Research', code: 'CREST', email: 'ops@crest.in', phone: '+91-9811000003', status: 'ACTIVE', created_at: new Date() },
    { id: VENDOR_4_ID, organization_id: ORG_ID, name: 'Delta Survey Network', code: 'DELTA', email: 'ops@delta.in', phone: '+91-9811000004', status: 'ACTIVE', created_at: new Date() },
    { id: VENDOR_5_ID, organization_id: ORG_ID, name: 'Echo Field Audits Ltd', code: 'ECHO', email: 'ops@echo.in', phone: '+91-9811000005', status: 'ACTIVE', created_at: new Date() },
  ],

  projects: [
    {
      id: PROJECT_1_ID,
      organization_id: ORG_ID,
      client_id: CLIENT_1_ID,
      name: 'Bihar State Assembly TVC Verification',
      project_code: 'TVC-BR-2026',
      code: 'TVC-BR-2026',
      type: 'TVC',
      enabled_modules: ['TVC'],
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: PROJECT_2_ID,
      organization_id: ORG_ID,
      client_id: CLIENT_2_ID,
      name: 'National Opinion Poll & CAPI Audit',
      project_code: 'CATI-NAT-2026',
      code: 'CATI-NAT-2026',
      type: 'CAPI',
      enabled_modules: ['CAPI', 'TVC'],
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: '44444444-4444-4444-4444-444444444443',
      organization_id: ORG_ID,
      client_id: CLIENT_1_ID,
      name: 'National Telephony Opinion Survey 2026',
      project_code: 'CATI-NAT-SURVEY-2026',
      code: 'CATI-NAT-SURVEY-2026',
      type: 'CATI',
      enabled_modules: ['CATI', 'REMOTE_CATI', 'FIELD_CATI'],
      status: 'ACTIVE',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],

  project_vendor_assignments: [
    { id: uuidv4(), project_id: PROJECT_1_ID, vendor_id: VENDOR_1_ID, is_active: true, created_at: new Date() },
    { id: uuidv4(), project_id: PROJECT_1_ID, vendor_id: VENDOR_2_ID, is_active: true, created_at: new Date() },
    { id: uuidv4(), project_id: PROJECT_1_ID, vendor_id: VENDOR_3_ID, is_active: true, created_at: new Date() },
    { id: uuidv4(), project_id: PROJECT_1_ID, vendor_id: VENDOR_4_ID, is_active: true, created_at: new Date() },
    { id: uuidv4(), project_id: PROJECT_1_ID, vendor_id: VENDOR_5_ID, is_active: true, created_at: new Date() },
  ],

  project_languages: [],

  // 2. Roles & Permissions
  roles: [
    { id: ROLE_MASTER_ADMIN_ID, name: 'Master Administrator', slug: 'MASTER_ADMIN', display_name: 'Master Admin', is_system: true, permissions: JSON.stringify(['*:*']) },
    { id: ROLE_CLIENT_ADMIN_ID, name: 'Client Administrator', slug: 'CLIENT_ADMIN', display_name: 'Client Admin', is_system: true, permissions: JSON.stringify(['clients:*', 'projects:*', 'reports:*', 'submissions:read']) },
    { id: ROLE_VENDOR_ADMIN_ID, name: 'Vendor Administrator', slug: 'VENDOR_ADMIN', display_name: 'Vendor Admin', is_system: true, permissions: JSON.stringify(['vendors:*', 'projects:read', 'users:*', 'submissions:*', 'reports:read']) },
    { id: ROLE_PM_ID, name: 'Project Manager', slug: 'PROJECT_MANAGER', display_name: 'Project Manager', is_system: true, permissions: JSON.stringify(['projects:*', 'submissions:*', 'capi_audit:*', 'super_audit:*', 'tvc:*', 'fa:*', 'reports:*']) },
    { id: ROLE_CATI_AGENT_ID, name: 'CATI Agent', slug: 'CATI_AGENT', display_name: 'CATI Agent', is_system: true, permissions: JSON.stringify(['submissions:create', 'submissions:read', 'submissions:update']) },
    { id: ROLE_CAPI_AUDITOR_ID, name: 'CAPI Auditor', slug: 'CAPI_AUDITOR', display_name: 'CAPI Auditor', is_system: true, permissions: JSON.stringify(['capi_audit:perform', 'capi_audit:read', 'submissions:read']) },
    { id: ROLE_SUPER_AUDITOR_ID, name: 'Super Auditor', slug: 'SUPER_AUDITOR', display_name: 'Super Auditor', is_system: true, permissions: JSON.stringify(['super_audit:perform', 'super_audit:read', 'capi_audit:read', 'submissions:read']) },
    { id: ROLE_TVC_AGENT_ID, name: 'TVC Agent', slug: 'TVC_AGENT', display_name: 'TVC Agent', is_system: true, permissions: JSON.stringify(['tvc:dial', 'tvc:read', 'submissions:read']) },
    { id: ROLE_FA_AGENT_ID, name: 'Feedback Agent (FA)', slug: 'FA_AGENT', display_name: 'Feedback Agent', is_system: true, permissions: JSON.stringify(['fa:dial', 'fa:read', 'submissions:read']) },
    { id: ROLE_EXAM_AGENT_ID, name: 'Examination Agent', slug: 'EXAM_AGENT', display_name: 'Exam Candidate', is_system: true, permissions: JSON.stringify(['exam:read', 'exam:submit']) },
    { id: ROLE_VIEWER_ID, name: 'Viewer', slug: 'VIEWER', display_name: 'Viewer', is_system: true, permissions: JSON.stringify(['reports:read', 'submissions:read']) },
  ],

  // 3. Users
  users: [
    {
      id: '88385a13-2e1f-4f44-b761-6a0dcf6a7c5c',
      organization_id: ORG_ID,
      email: 'admin@mastercrm.com',
      password_hash: HASH_ADMIN,
      first_name: 'Master',
      last_name: 'Admin',
      phone: '+18001234567',
      role_id: ROLE_MASTER_ADMIN_ID,
      vendor_id: null,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_ADMIN_ID,
      organization_id: ORG_ID,
      email: 'admin@crm.local',
      password_hash: HASH_ADMIN,
      first_name: 'Raj',
      last_name: 'Singhania',
      phone: '+91-9000000001',
      role_id: ROLE_MASTER_ADMIN_ID,
      vendor_id: null,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_CLIENT_ID,
      organization_id: ORG_ID,
      email: 'client@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Amit',
      last_name: 'Desai',
      phone: '+91-9000000002',
      role_id: ROLE_CLIENT_ADMIN_ID,
      vendor_id: null,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-02T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_VENDOR_ID,
      organization_id: ORG_ID,
      email: 'vendor@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Suresh',
      last_name: 'Reddy',
      phone: '+91-9000000003',
      role_id: ROLE_VENDOR_ADMIN_ID,
      vendor_id: VENDOR_1_ID,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-03T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_PM_ID,
      organization_id: ORG_ID,
      email: 'pm@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Pooja',
      last_name: 'Kashyap',
      phone: '+91-9000000004',
      role_id: ROLE_PM_ID,
      vendor_id: null,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-04T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_CATI_ID,
      organization_id: ORG_ID,
      email: 'cati@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Rahul',
      last_name: 'Verma',
      phone: '+91-9000000005',
      role_id: ROLE_CATI_AGENT_ID,
      vendor_id: VENDOR_1_ID,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-05T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_CAPI_ID,
      organization_id: ORG_ID,
      email: 'capi@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Anjali',
      last_name: 'Mehta',
      phone: '+91-9000000006',
      role_id: ROLE_CAPI_AUDITOR_ID,
      vendor_id: VENDOR_1_ID,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-06T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_SUPER_ID,
      organization_id: ORG_ID,
      email: 'superauditor@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Vikram',
      last_name: 'Saxena',
      phone: '+91-9000000007',
      role_id: ROLE_SUPER_AUDITOR_ID,
      vendor_id: null,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-07T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_TVC_ID,
      organization_id: ORG_ID,
      email: 'tvc@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Neha',
      last_name: 'Sharma',
      phone: '+91-9000000008',
      role_id: ROLE_TVC_AGENT_ID,
      vendor_id: VENDOR_1_ID,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-08T00:00:00Z'),
      updated_at: new Date(),
    },
    {
      id: USER_FA_ID,
      organization_id: ORG_ID,
      email: 'fa@crm.local',
      password_hash: HASH_PASS,
      first_name: 'Karan',
      last_name: 'Joshi',
      phone: '+91-9000000009',
      role_id: ROLE_FA_AGENT_ID,
      vendor_id: VENDOR_1_ID,
      status: 'ACTIVE',
      last_login_at: new Date(),
      created_at: new Date('2026-01-09T00:00:00Z'),
      updated_at: new Date(),
    },
  ],

  user_project_assignments: [
    {
      id: uuidv4(),
      user_id: USER_CATI_ID,
      project_id: PROJECT_1_ID,
      assigned_modules: JSON.stringify(['CATI']),
      assigned_states: JSON.stringify(['UP']),
      is_active: true,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: USER_CAPI_ID,
      project_id: PROJECT_1_ID,
      assigned_modules: JSON.stringify(['CAPI']),
      assigned_states: JSON.stringify(['UP', 'MH']),
      is_active: true,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: USER_SUPER_ID,
      project_id: PROJECT_1_ID,
      assigned_modules: JSON.stringify(['SUPER_AUDIT']),
      assigned_states: JSON.stringify(['UP', 'MH', 'BR']),
      is_active: true,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: USER_TVC_ID,
      project_id: PROJECT_1_ID,
      assigned_modules: JSON.stringify(['TVC']),
      assigned_states: JSON.stringify(['UP']),
      is_active: true,
      created_at: new Date(),
    },
    {
      id: uuidv4(),
      user_id: USER_FA_ID,
      project_id: PROJECT_1_ID,
      assigned_modules: JSON.stringify(['FA']),
      assigned_states: JSON.stringify(['UP']),
      is_active: true,
      created_at: new Date(),
    },
  ],

  refresh_tokens: [],
  devices: [],

  // 4. Questionnaires
  questionnaire_versions: [
    {
      id: QV_1_ID,
      project_id: PROJECT_1_ID,
      module: 'CATI',
      name: 'CATI National Voter Opinion Core v1.0',
      version_number: 1,
      status: 'PUBLISHED',
      published_at: new Date('2026-02-01T00:00:00Z'),
      published_by: USER_ADMIN_ID,
      checksum: 'e9b23f8c7d1e45a6',
      created_by: USER_ADMIN_ID,
      created_at: new Date('2026-02-01T00:00:00Z'),
      updated_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: QV_2_ID,
      project_id: PROJECT_1_ID,
      module: 'CAPI',
      name: 'CAPI Field Audit Protocol v1.0',
      version_number: 1,
      status: 'PUBLISHED',
      published_at: new Date('2026-02-01T00:00:00Z'),
      published_by: USER_ADMIN_ID,
      checksum: 'a8b13c9e5f2a17d8',
      created_by: USER_ADMIN_ID,
      created_at: new Date('2026-02-01T00:00:00Z'),
      updated_at: new Date('2026-02-01T00:00:00Z'),
    },
  ],

  sections: [
    { id: SEC_1_ID, questionnaire_version_id: QV_1_ID, code: 'SEC_DEMO', title: 'Respondent Demographics', display_order: 1 },
    { id: SEC_2_ID, questionnaire_version_id: QV_1_ID, code: 'SEC_ELECTORAL', title: 'Electoral Preference & Key Issues', display_order: 2 },
    { id: SEC_3_ID, questionnaire_version_id: QV_1_ID, code: 'SEC_EVAL', title: 'Government Performance Rating', display_order: 3 },
  ],

  questions: [
    {
      id: Q_AGE_ID,
      section_id: SEC_1_ID,
      questionnaire_version_id: QV_1_ID,
      question_no: 'Q1',
      question_tag: 'DEMO_AGE',
      question_type: 'NUMBER',
      question_text: 'What is your current age in completed years?',
      is_required: true,
      display_order: 1,
      input_tag: 'DEMO_AGE',
      output_tag: 'DEMO_AGE',
      is_enabled: true,
      validation_rules: JSON.stringify({ min: 18, max: 110 }),
    },
    {
      id: Q_GEN_ID,
      section_id: SEC_1_ID,
      questionnaire_version_id: QV_1_ID,
      question_no: 'Q2',
      question_tag: 'DEMO_GENDER',
      question_type: 'SINGLE_SELECT',
      question_text: 'Gender of the respondent',
      is_required: true,
      display_order: 2,
      input_tag: 'DEMO_GENDER',
      output_tag: 'DEMO_GENDER',
      is_enabled: true,
      validation_rules: JSON.stringify({}),
    },
    {
      id: Q_VOTE_ID,
      section_id: SEC_2_ID,
      questionnaire_version_id: QV_1_ID,
      question_no: 'Q3',
      question_tag: 'VOTE_INTENT',
      question_type: 'SINGLE_SELECT',
      question_text: 'If assembly elections were held tomorrow, which political party would you vote for?',
      is_required: true,
      display_order: 3,
      input_tag: 'VOTE_INTENT',
      output_tag: 'VOTE_INTENT',
      is_enabled: true,
      validation_rules: JSON.stringify({}),
    },
    {
      id: Q_ISSUE_ID,
      section_id: SEC_2_ID,
      questionnaire_version_id: QV_1_ID,
      question_no: 'Q4',
      question_tag: 'PRIMARY_ISSUE',
      question_type: 'SINGLE_SELECT',
      question_text: 'What is the most pressing governance issue determining your vote?',
      is_required: true,
      display_order: 4,
      input_tag: 'PRIMARY_ISSUE',
      output_tag: 'PRIMARY_ISSUE',
      is_enabled: true,
      validation_rules: JSON.stringify({}),
    },
    {
      id: Q_RATE_ID,
      section_id: SEC_3_ID,
      questionnaire_version_id: QV_1_ID,
      question_no: 'Q5',
      question_tag: 'GOV_SATISFACTION',
      question_type: 'RATING',
      question_text: 'On a scale from 1 (Very Dissatisfied) to 5 (Very Satisfied), how do you rate the state government?',
      is_required: true,
      display_order: 5,
      input_tag: 'GOV_SATISFACTION',
      output_tag: 'GOV_SATISFACTION',
      is_enabled: true,
      validation_rules: JSON.stringify({ min: 1, max: 5 }),
    },
  ],

  question_options: [
    { id: uuidv4(), question_id: Q_GEN_ID, option_code: 'MALE', label: 'Male', value: 'MALE', display_order: 1, is_active: true },
    { id: uuidv4(), question_id: Q_GEN_ID, option_code: 'FEMALE', label: 'Female', value: 'FEMALE', display_order: 2, is_active: true },
    { id: uuidv4(), question_id: Q_GEN_ID, option_code: 'OTHER', label: 'Other', value: 'OTHER', display_order: 3, is_active: true },

    { id: uuidv4(), question_id: Q_VOTE_ID, option_code: 'PARTY_A', label: 'Ruling Alliance', value: 'PARTY_A', display_order: 1, is_active: true },
    { id: uuidv4(), question_id: Q_VOTE_ID, option_code: 'PARTY_B', label: 'Opposition Front', value: 'PARTY_B', display_order: 2, is_active: true },
    { id: uuidv4(), question_id: Q_VOTE_ID, option_code: 'PARTY_C', label: 'Independent / Others', value: 'PARTY_C', display_order: 3, is_active: true },
    { id: uuidv4(), question_id: Q_VOTE_ID, option_code: 'UNDECIDED', label: 'Undecided / Refused', value: 'UNDECIDED', display_order: 4, is_active: true },

    { id: uuidv4(), question_id: Q_ISSUE_ID, option_code: 'INFLATION', label: 'Inflation & Price Rise', value: 'INFLATION', display_order: 1, is_active: true },
    { id: uuidv4(), question_id: Q_ISSUE_ID, option_code: 'EMPLOYMENT', label: 'Unemployment & Youth Jobs', value: 'EMPLOYMENT', display_order: 2, is_active: true },
    { id: uuidv4(), question_id: Q_ISSUE_ID, option_code: 'ROADS', label: 'Roads & Infrastructure', value: 'ROADS', display_order: 3, is_active: true },
    { id: uuidv4(), question_id: Q_ISSUE_ID, option_code: 'HEALTHCARE', label: 'Healthcare & Hospitals', value: 'HEALTHCARE', display_order: 4, is_active: true },
  ],

  translations: [],
  tag_definitions: [
    { id: uuidv4(), tag_key: 'DEMO_AGE', data_type: 'number', module: 'CATI', description: 'Respondent age' },
    { id: uuidv4(), tag_key: 'VOTE_INTENT', data_type: 'string', module: 'CATI', description: 'Voter party choice' },
  ],
  tag_mappings: [],

  // 5. Submissions
  submissions: [
    {
      id: '99999999-9999-9999-9999-999999990088',
      submission_id: 'SUB-WB-ALIPURDUAR-2026-001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'WB',
      source_channel: 'FIELD_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-WB-01',
      source_call_id: 'CALL-WB-2026-001',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'সুনীল রায় (Sunil Roy - Alipurduar)',
      respondent_phone: '+91-9876543210',
      respondent_metadata: JSON.stringify({
        district: 'আলিপুরদুয়ার (Alipurduar)',
        ac: '12 - Alipurduars',
        local_body_type: 'পঞ্চায়েত (Sarpanch)',
        block_name: 'Alipurduar-I',
        gram_panchayat: 'Babupara GP',
        isWbAssemblyLead: true,
      }),
      geography_data: JSON.stringify({ state: 'WB', district: 'Alipurduar', ac: '12 - Alipurduars' }),
      source_status: 'COMPLETED',
      capi_status: 'PENDING',
      super_audit_status: 'PENDING',
      tvc_status: 'QUEUED',
      fa_status: 'PENDING',
      priority: 100,
      risk_score: 8.0,
      labels: JSON.stringify(['WB_ASSEMBLY_SURVEY', 'CONDITIONAL_22Q']),
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '99999999-9999-9999-9999-999999990099',
      submission_id: 'SUB-TEST-CONDITIONAL-01',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'WB',
      source_channel: 'FIELD_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TEST-01',
      source_call_id: 'CALL-TEST-COND-01',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Pooja Mondal (🎯 Test Conditional Lead)',
      respondent_phone: '+91-9831002233',
      respondent_metadata: JSON.stringify({ district: 'Purba Medinipur', ac: '216 - Kanthi Dakshin', isTestLead: true }),
      geography_data: JSON.stringify({ state: 'WB', district: 'Purba Medinipur', ac: '216 - Kanthi Dakshin' }),
      source_status: 'COMPLETED',
      capi_status: 'PENDING',
      super_audit_status: 'PENDING',
      tvc_status: 'QUEUED',
      fa_status: 'PENDING',
      priority: 100,
      risk_score: 5.0,
      labels: JSON.stringify(['TEST_LEAD', 'CONDITIONAL_DISTRICT_AC']),
      started_at: new Date(),
      completed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: '99999999-9999-9999-9999-999999990001',
      submission_id: 'SUB-NVP-2026-0001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'UP',
      source_channel: 'REMOTE_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TEL-01',
      source_call_id: 'CALL-20260210-001',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Rajesh Kumar',
      respondent_phone: '+91-9871100111',
      respondent_metadata: JSON.stringify({ ac: 'Varanasi South', pc: 'Varanasi', booth: '101' }),
      geography_data: JSON.stringify({ state: 'UP', pc: 'Varanasi', ac: 'Varanasi South' }),
      source_status: 'COMPLETED',
      capi_status: 'PASSED',
      super_audit_status: 'APPROVED',
      tvc_status: 'VERIFIED',
      fa_status: 'COMPLETED',
      priority: 80,
      risk_score: 12.5,
      labels: JSON.stringify(['HIGH_QUALITY', 'AUDIO_VERIFIED']),
      started_at: new Date('2026-02-10T09:30:00Z'),
      completed_at: new Date('2026-02-10T09:44:20Z'),
      created_at: new Date('2026-02-10T09:44:25Z'),
      updated_at: new Date('2026-02-10T09:44:25Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999990002',
      submission_id: 'SUB-NVP-2026-0002',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'UP',
      source_channel: 'REMOTE_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TEL-01',
      source_call_id: 'CALL-20260210-002',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Priya Sharma',
      respondent_phone: '+91-9871100222',
      respondent_metadata: JSON.stringify({ ac: 'Lucknow Central', pc: 'Lucknow', booth: '45' }),
      geography_data: JSON.stringify({ state: 'UP', pc: 'Lucknow', ac: 'Lucknow Central' }),
      source_status: 'COMPLETED',
      capi_status: 'PASSED',
      super_audit_status: 'PENDING',
      tvc_status: 'QUEUED',
      fa_status: 'PENDING',
      priority: 60,
      risk_score: 25.0,
      labels: JSON.stringify(['STANDARD']),
      started_at: new Date('2026-02-10T10:00:00Z'),
      completed_at: new Date('2026-02-10T10:12:15Z'),
      created_at: new Date('2026-02-10T10:12:20Z'),
      updated_at: new Date('2026-02-10T10:12:20Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999990003',
      submission_id: 'SUB-NVP-2026-0003',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'MH',
      source_channel: 'FIELD_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TAB-09',
      source_call_id: null,
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Amit Patel',
      respondent_phone: '+91-9871100333',
      respondent_metadata: JSON.stringify({ ac: 'Colaba', pc: 'Mumbai South', booth: '12' }),
      geography_data: JSON.stringify({ state: 'MH', pc: 'Mumbai South', ac: 'Colaba' }),
      source_status: 'COMPLETED',
      capi_status: 'FAILED',
      super_audit_status: 'ESCALATED',
      tvc_status: 'PENDING',
      fa_status: 'QUEUED',
      priority: 95,
      risk_score: 82.0,
      labels: JSON.stringify(['AUDIO_ANOMALY', 'MISMATCH_FLAGGED']),
      started_at: new Date('2026-02-10T11:15:00Z'),
      completed_at: new Date('2026-02-10T11:20:00Z'),
      created_at: new Date('2026-02-10T11:20:10Z'),
      updated_at: new Date('2026-02-10T11:20:10Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999990004',
      submission_id: 'SUB-NVP-2026-0004',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      state_id: 'BR',
      source_channel: 'REMOTE_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TEL-01',
      source_call_id: 'CALL-20260210-004',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Sunita Devi',
      respondent_phone: '+91-9871100444',
      respondent_metadata: JSON.stringify({ ac: 'Bankipur', pc: 'Patna Sahib', booth: '88' }),
      geography_data: JSON.stringify({ state: 'BR', pc: 'Patna Sahib', ac: 'Bankipur' }),
      source_status: 'COMPLETED',
      capi_status: 'IN_PROGRESS',
      super_audit_status: 'PENDING',
      tvc_status: 'PENDING',
      fa_status: 'PENDING',
      priority: 50,
      risk_score: 30.0,
      labels: JSON.stringify([]),
      started_at: new Date('2026-02-10T12:00:00Z'),
      completed_at: new Date('2026-02-10T12:15:00Z'),
      created_at: new Date('2026-02-10T12:15:05Z'),
      updated_at: new Date('2026-02-10T12:15:05Z'),
    },
    {
      id: '99999999-9999-9999-9999-999999990005',
      submission_id: 'SUB-NVP-2026-0005',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_2_ID,
      state_id: 'UP',
      source_channel: 'REMOTE_CATI',
      source_agent_id: USER_CATI_ID,
      source_device_id: 'DEV-TEL-02',
      source_call_id: 'CALL-20260210-005',
      questionnaire_version_id: QV_1_ID,
      respondent_name: 'Mohammad Tariq',
      respondent_phone: '+91-9871100555',
      respondent_metadata: JSON.stringify({ ac: 'Lucknow Central', pc: 'Lucknow', booth: '10' }),
      geography_data: JSON.stringify({ state: 'UP', pc: 'Lucknow', ac: 'Lucknow Central' }),
      source_status: 'SUBMITTED',
      capi_status: 'PENDING',
      super_audit_status: 'PENDING',
      tvc_status: 'PENDING',
      fa_status: 'PENDING',
      priority: 40,
      risk_score: 15.0,
      labels: JSON.stringify([]),
      started_at: new Date('2026-02-10T13:00:00Z'),
      completed_at: new Date('2026-02-10T13:14:00Z'),
      created_at: new Date('2026-02-10T13:14:10Z'),
      updated_at: new Date('2026-02-10T13:14:10Z'),
    },
  ],

  submission_responses: [
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990001', question_id: Q_AGE_ID, question_tag: 'DEMO_AGE', response_value: '38', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990001', question_id: Q_GEN_ID, question_tag: 'DEMO_GENDER', response_value: 'MALE', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990001', question_id: Q_VOTE_ID, question_tag: 'VOTE_INTENT', response_value: 'PARTY_A', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990001', question_id: Q_ISSUE_ID, question_tag: 'PRIMARY_ISSUE', response_value: 'ROADS', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990001', question_id: Q_RATE_ID, question_tag: 'GOV_SATISFACTION', response_value: '4', answered_at: new Date() },

    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990002', question_id: Q_AGE_ID, question_tag: 'DEMO_AGE', response_value: '29', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990002', question_id: Q_GEN_ID, question_tag: 'DEMO_GENDER', response_value: 'FEMALE', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990002', question_id: Q_VOTE_ID, question_tag: 'VOTE_INTENT', response_value: 'PARTY_B', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990002', question_id: Q_ISSUE_ID, question_tag: 'PRIMARY_ISSUE', response_value: 'EMPLOYMENT', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990002', question_id: Q_RATE_ID, question_tag: 'GOV_SATISFACTION', response_value: '2', answered_at: new Date() },

    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990003', question_id: Q_AGE_ID, question_tag: 'DEMO_AGE', response_value: '45', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990003', question_id: Q_GEN_ID, question_tag: 'DEMO_GENDER', response_value: 'MALE', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990003', question_id: Q_VOTE_ID, question_tag: 'VOTE_INTENT', response_value: 'PARTY_C', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990003', question_id: Q_ISSUE_ID, question_tag: 'PRIMARY_ISSUE', response_value: 'INFLATION', answered_at: new Date() },
    { id: uuidv4(), submission_id: '99999999-9999-9999-9999-999999990003', question_id: Q_RATE_ID, question_tag: 'GOV_SATISFACTION', response_value: '1', answered_at: new Date() },
  ],

  // 5b. Submission Values
  submission_values: [
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'DEMO_AGE', response_value: '34', created_at: new Date() },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'DEMO_GENDER', response_value: 'MALE', created_at: new Date() },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'VOTE_INTENT', response_value: 'PARTY_A', created_at: new Date() },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0003', question_tag: 'DEMO_AGE', response_value: '45', created_at: new Date() },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0003', question_tag: 'DEMO_GENDER', response_value: 'MALE', created_at: new Date() },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0003', question_tag: 'VOTE_INTENT', response_value: 'PARTY_C', created_at: new Date() },
  ],

  // 5c. Audio Sessions & Segments
  audio_sessions: [
    {
      id: 'cc110000-0000-0000-0000-000000000001',
      submission_id: 'SUB-NVP-2026-0001',
      project_id: PROJECT_1_ID,
      surveyor_id: USER_CATI_ID,
      storage_path: 'uploads/recordings/SUB-NVP-2026-0001.webm',
      storage_url: 'https://storage.crm.local/audio/rec_nvp_001.mp3',
      duration_seconds: 860,
      file_size_bytes: 4194304,
      mime_type: 'audio/webm',
      status: 'COMPLETED',
      created_at: new Date('2026-02-10T09:44:20Z'),
    },
  ],

  audio_chunks: [],

  question_audio_segments: [
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'DEMO_AGE', start_time_seconds: 0, end_time_seconds: 25, audio_url: 'https://storage.crm.local/audio/rec_nvp_001.mp3' },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'DEMO_GENDER', start_time_seconds: 25, end_time_seconds: 50, audio_url: 'https://storage.crm.local/audio/rec_nvp_001.mp3' },
    { id: uuidv4(), submission_id: 'SUB-NVP-2026-0001', question_tag: 'VOTE_INTENT', start_time_seconds: 50, end_time_seconds: 120, audio_url: 'https://storage.crm.local/audio/rec_nvp_001.mp3' },
  ],

  agent_location_events: [
    {
      id: uuidv4(),
      surveyor_id: USER_CATI_ID,
      submission_id: 'SUB-NVP-2026-0001',
      project_id: PROJECT_1_ID,
      latitude: 25.3176,
      longitude: 82.9739,
      accuracy: 4.2,
      speed: 0.8,
      altitude: 78.5,
      battery_level: 89,
      network_type: '4G',
      is_mock_location: false,
      recorded_at: new Date('2026-02-10T09:30:00Z'),
      created_at: new Date('2026-02-10T09:30:00Z'),
    },
  ],

  // 6. CAPI Audits & Items
  capi_audits: [
    {
      id: 'aaaa1111-1111-1111-1111-111111110088',
      submission_id: '99999999-9999-9999-9999-999999990088',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: null,
      audit_type: 'AUDIO_FIRST',
      status: 'PENDING',
      audio_url: 'https://survey-audios.s3.ap-south-1.amazonaws.com/00083c44cb32b5f86417e0c8.mp3',
      audio_duration: 320,
      audio_quality_score: 97.0,
      audio_status: 'PRESENT',
      gps_lat: 26.4918,
      gps_lng: 89.5271,
      gps_accuracy: 2.8,
      gps_status: 'MATCH',
      score: null,
      decision: null,
      feedback: null,
      flags: JSON.stringify([]),
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      metadata: JSON.stringify({
        isWbAssemblySurvey: true,
        district: 'আলিপুরদুয়ার (Alipurduar)',
        ac_name: '12 - Alipurduars',
        questionsCount: 22,
        conditionalFlow: 'Q2 (District) -> Q3 (AC) -> Q4 (Panchayat) -> Q5 (Block) -> Q6 (GP) -> Q12 (CM 1st) -> Q13 (CM 2nd)',
      }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'aaaa1111-1111-1111-1111-111111110099',
      submission_id: '99999999-9999-9999-9999-999999990099',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: null,
      audit_type: 'AUDIO_FIRST',
      status: 'PENDING',
      audio_url: 'https://survey-audios.s3.ap-south-1.amazonaws.com/00083c44cb32b5f86417e0c8.mp3',
      audio_duration: 380,
      audio_quality_score: 96.0,
      audio_status: 'PRESENT',
      gps_lat: 21.7781,
      gps_lng: 87.7517,
      gps_accuracy: 3.0,
      gps_status: 'MATCH',
      score: null,
      decision: null,
      feedback: null,
      flags: JSON.stringify([]),
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      metadata: JSON.stringify({
        isTestLead: true,
        district: 'Purba Medinipur',
        ac_name: '216 - Kanthi Dakshin',
        conditionalFlow: 'District -> AC Name'
      }),
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      id: 'aaaa1111-1111-1111-1111-111111110001',
      submission_id: '99999999-9999-9999-9999-999999990001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: USER_CAPI_ID,
      audit_type: 'AUDIO_FIRST',
      status: 'COMPLETED',
      audio_url: 'https://storage.crm.local/audio/rec_nvp_001.mp3',
      audio_duration: 860,
      audio_quality_score: 94.5,
      audio_status: 'PRESENT',
      gps_lat: 25.3176,
      gps_lng: 82.9739,
      gps_accuracy: 4.2,
      gps_status: 'MATCH',
      score: 95.0,
      decision: 'PASS',
      feedback: 'Excellent interview pace and respondent engagement verified against recording.',
      flags: JSON.stringify([]),
      started_at: new Date('2026-02-10T14:00:00Z'),
      completed_at: new Date('2026-02-10T14:15:00Z'),
      duration_seconds: 900,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T14:00:00Z'),
      updated_at: new Date('2026-02-10T14:15:00Z'),
    },
    {
      id: 'aaaa1111-1111-1111-1111-111111110002',
      submission_id: '99999999-9999-9999-9999-999999990003',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: USER_CAPI_ID,
      audit_type: 'AUDIO_FIRST',
      status: 'COMPLETED',
      audio_url: 'https://storage.crm.local/audio/rec_nvp_003.mp3',
      audio_duration: 290,
      audio_quality_score: 42.0,
      audio_status: 'PRESENT',
      gps_lat: 18.9220,
      gps_lng: 72.8347,
      gps_accuracy: 15.0,
      gps_status: 'MATCH',
      score: 40.0,
      decision: 'FAIL',
      feedback: 'Multiple leading questions detected. Total duration too short for complete instrument.',
      flags: JSON.stringify(['RUSHED_SURVEY', 'LEADING_QUESTIONS']),
      started_at: new Date('2026-02-10T15:00:00Z'),
      completed_at: new Date('2026-02-10T15:20:00Z'),
      duration_seconds: 1200,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T15:00:00Z'),
      updated_at: new Date('2026-02-10T15:20:00Z'),
    },
    {
      id: 'aaaa1111-1111-1111-1111-111111110003',
      submission_id: '99999999-9999-9999-9999-999999990002',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: null,
      audit_type: 'AUDIO_FIRST',
      status: 'PENDING',
      audio_url: 'https://storage.crm.local/audio/rec_nvp_004.mp3',
      audio_duration: 620,
      audio_quality_score: 88.0,
      audio_status: 'PRESENT',
      gps_lat: 19.0760,
      gps_lng: 72.8777,
      gps_accuracy: 5.0,
      gps_status: 'MATCH',
      score: null,
      decision: null,
      feedback: null,
      flags: JSON.stringify([]),
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-11T09:00:00Z'),
      updated_at: new Date('2026-02-11T09:00:00Z'),
    },
    {
      id: 'aaaa1111-1111-1111-1111-111111110004',
      submission_id: '99999999-9999-9999-9999-999999990001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      auditor_id: null,
      audit_type: 'AUDIO_FIRST',
      status: 'PENDING',
      audio_url: 'https://storage.crm.local/audio/rec_nvp_005.mp3',
      audio_duration: 540,
      audio_quality_score: 91.0,
      audio_status: 'PRESENT',
      gps_lat: 25.3176,
      gps_lng: 82.9739,
      gps_accuracy: 3.5,
      gps_status: 'MATCH',
      score: null,
      decision: null,
      feedback: null,
      flags: JSON.stringify([]),
      started_at: null,
      completed_at: null,
      duration_seconds: null,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-11T09:30:00Z'),
      updated_at: new Date('2026-02-11T09:30:00Z'),
    },
  ],

  capi_audit_items: [
    {
      id: uuidv4(),
      capi_audit_id: 'aaaa1111-1111-1111-1111-111111110001',
      question_id: Q_VOTE_ID,
      question_tag: 'VOTE_INTENT',
      original_value: 'PARTY_A',
      audited_value: 'PARTY_A',
      status: 'PASS',
      is_mismatch: false,
      audio_timestamp_start: 120,
      audio_timestamp_end: 150,
      notes: 'Clearly audible respondent confirmation.',
    },
    {
      id: uuidv4(),
      capi_audit_id: 'aaaa1111-1111-1111-1111-111111110002',
      question_id: Q_VOTE_ID,
      question_tag: 'VOTE_INTENT',
      original_value: 'PARTY_C',
      audited_value: 'PARTY_B',
      status: 'FAIL',
      is_mismatch: true,
      audio_timestamp_start: 90,
      audio_timestamp_end: 110,
      notes: 'Respondent said Party B, but enumerator marked Party C.',
    },
  ],

  // 7. Super Audits & Items
  super_audits: [
    {
      id: 'bbbb2222-2222-2222-2222-222222220001',
      submission_id: '99999999-9999-9999-9999-999999990003',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      capi_audit_id: 'aaaa1111-1111-1111-1111-111111110002',
      super_auditor_id: USER_SUPER_ID,
      routing_reason: 'AUDITOR_FAIL_ESCALATION',
      status: 'COMPLETED',
      decision: 'AGREE',
      original_decision: 'FAIL',
      final_decision: 'CONFIRMED_FAIL',
      capi_score: 40.0,
      super_audit_score: 38.0,
      variance_score: 2.0,
      notes: 'Super audit confirms severe leading prompts and data discrepancy by enumerator.',
      metadata: JSON.stringify({ escalatedToFa: true }),
      started_at: new Date('2026-02-11T10:00:00Z'),
      completed_at: new Date('2026-02-11T10:25:00Z'),
      created_at: new Date('2026-02-11T10:00:00Z'),
      updated_at: new Date('2026-02-11T10:25:00Z'),
    },
  ],

  super_audit_items: [
    {
      id: uuidv4(),
      super_audit_id: 'bbbb2222-2222-2222-2222-222222220001',
      question_id: Q_VOTE_ID,
      question_tag: 'VOTE_INTENT',
      original_response: 'PARTY_C',
      capi_eval_status: 'FAIL',
      super_eval_status: 'AGREE',
      overrule_reason: null,
    },
  ],

  // 8. TVC Leads & Attempts
  tvc_leads: [
    {
      id: 'cccc3333-3333-3333-3333-333333330001',
      submission_id: '99999999-9999-9999-9999-999999990001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      agent_id: USER_TVC_ID,
      respondent_name: 'Rajesh Kumar',
      phone_number: '+91-9871100111',
      status: 'VERIFIED',
      priority: 80,
      total_attempts: 1,
      max_attempts: 3,
      last_attempt_at: new Date('2026-02-11T11:00:00Z'),
      next_callback_at: null,
      last_disposition: 'CONFIRMED_INTERVIEW',
      verification_status: 'VERIFIED',
      verification_score: 100.0,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T10:00:00Z'),
      updated_at: new Date('2026-02-11T11:05:00Z'),
    },
    {
      id: 'cccc3333-3333-3333-3333-333333330002',
      submission_id: '99999999-9999-9999-9999-999999990002',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      agent_id: null,
      respondent_name: 'Priya Sharma',
      phone_number: '+91-9871100222',
      status: 'QUEUED',
      priority: 60,
      total_attempts: 0,
      max_attempts: 3,
      last_attempt_at: null,
      next_callback_at: null,
      last_disposition: null,
      verification_status: 'PENDING',
      verification_score: 0.0,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T11:00:00Z'),
      updated_at: new Date('2026-02-10T11:00:00Z'),
    },
    {
      id: 'cccc3333-3333-3333-3333-333333330003',
      submission_id: '99999999-9999-9999-9999-999999990003',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      agent_id: null,
      respondent_name: 'Anand Patel',
      phone_number: '+91-9871100333',
      status: 'QUEUED',
      priority: 75,
      total_attempts: 0,
      max_attempts: 3,
      last_attempt_at: null,
      next_callback_at: null,
      last_disposition: null,
      verification_status: 'PENDING',
      verification_score: 0.0,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T11:30:00Z'),
      updated_at: new Date('2026-02-10T11:30:00Z'),
    },
    {
      id: 'cccc3333-3333-3333-3333-333333330004',
      submission_id: '99999999-9999-9999-9999-999999990001',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      agent_id: null,
      respondent_name: 'Sunita Rao',
      phone_number: '+91-9871100444',
      status: 'QUEUED',
      priority: 85,
      total_attempts: 0,
      max_attempts: 3,
      last_attempt_at: null,
      next_callback_at: null,
      last_disposition: null,
      verification_status: 'PENDING',
      verification_score: 0.0,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T12:00:00Z'),
      updated_at: new Date('2026-02-10T12:00:00Z'),
    },
    {
      id: 'cccc3333-3333-3333-3333-333333330005',
      submission_id: '99999999-9999-9999-9999-999999990002',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      agent_id: null,
      respondent_name: 'Mohammad Tariq',
      phone_number: '+91-9871100555',
      status: 'QUEUED',
      priority: 50,
      total_attempts: 0,
      max_attempts: 3,
      last_attempt_at: null,
      next_callback_at: null,
      last_disposition: null,
      verification_status: 'PENDING',
      verification_score: 0.0,
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-10T12:30:00Z'),
      updated_at: new Date('2026-02-10T12:30:00Z'),
    },
  ],

  tvc_attempts: [
    {
      id: uuidv4(),
      tvc_lead_id: 'cccc3333-3333-3333-3333-333333330001',
      agent_id: USER_TVC_ID,
      attempt_number: 1,
      dialer_call_id: 'CDR-TVC-001',
      call_status: 'COMPLETED',
      disposition: 'CONFIRMED_INTERVIEW',
      call_duration: 180,
      recording_url: 'https://storage.crm.local/tvc/call_001.mp3',
      verification_answers: JSON.stringify({ did_survey: true, agent_polite: true, verified_age: true }),
      notes: 'Respondent gladly verified answering the voter survey yesterday.',
      attempted_at: new Date('2026-02-11T11:00:00Z'),
    },
  ],

  // 9. Feedback Leads & Attempts
  feedback_leads: [
    {
      id: 'dddd4444-4444-4444-4444-444444440001',
      submission_id: '99999999-9999-9999-9999-999999990003',
      project_id: PROJECT_1_ID,
      vendor_id: VENDOR_1_ID,
      field_agent_id: USER_CATI_ID,
      feedback_caller_id: USER_FA_ID,
      origin_module: 'SUPER_AUDIT',
      reason_for_feedback: 'Discrepancy in recorded vote intention vs audio recording',
      status: 'COMPLETED',
      resolution: 'COACHING_DELIVERED',
      total_attempts: 1,
      max_attempts: 3,
      last_attempt_at: new Date('2026-02-11T16:00:00Z'),
      next_callback_at: null,
      discrepancy_summary: JSON.stringify({ question: 'VOTE_INTENT', recorded: 'PARTY_C', actual: 'PARTY_B' }),
      metadata: JSON.stringify({}),
      created_at: new Date('2026-02-11T11:00:00Z'),
      updated_at: new Date('2026-02-11T16:15:00Z'),
    },
  ],

  feedback_attempts: [
    {
      id: uuidv4(),
      feedback_lead_id: 'dddd4444-4444-4444-4444-444444440001',
      caller_id: USER_FA_ID,
      attempt_number: 1,
      dialer_call_id: 'CDR-FA-001',
      call_status: 'CONNECTED',
      disposition: 'CALL_COMPLETE_MISTAKE_ADMITTED',
      mistake_admitted: true,
      mistake_reason: 'Enumerator admitted rushed multi-tasking error during input.',
      dispute_notes: null,
      corrective_action: 'RE_TRAINING_SCHEDULED',
      notes: 'Enumerator agreed to review standard operating procedure audio guidelines.',
      call_duration: 320,
      recording_url: 'https://storage.crm.local/fa/rec_fa_001.mp3',
      attempted_at: new Date('2026-02-11T16:00:00Z'),
    },
  ],

  // 9b. Campaign Leads (Multi-Vendor pool supporting equal split allocation)
  campaign_leads: generateInitialCampaignLeads(65, PROJECT_1_ID),

  // 9c. Campaign Questionnaires (Many-to-Many binding: Question Builder questionnaires bound to campaigns)
  campaign_questionnaires: [
    {
      id: 'cq-001',
      project_id: PROJECT_1_ID,
      questionnaire_id: QV_1_ID,
      module: 'CATI',
      is_primary: true,
      bound_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'cq-002',
      project_id: PROJECT_1_ID,
      questionnaire_id: QV_2_ID,
      module: 'CAPI',
      is_primary: false,
      bound_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'cq-003',
      project_id: PROJECT_2_ID,
      questionnaire_id: QV_1_ID, // Same questionnaire bound to multiple campaigns
      module: 'CATI',
      is_primary: true,
      bound_at: new Date('2026-02-15T00:00:00Z'),
    },
  ],

  // 10. Dialer CDRs
  dialer_cdr: [
    {
      id: uuidv4(),
      call_id: 'CDR-TVC-001',
      provider: 'MOCK_REST',
      direction: 'OUTBOUND',
      caller_number: '+91-1140001111',
      destination_number: '+91-9871100111',
      agent_id: USER_TVC_ID,
      project_id: PROJECT_1_ID,
      module: 'TVC',
      reference_id: 'cccc3333-3333-3333-3333-333333330001',
      status: 'COMPLETED',
      duration_seconds: 180,
      billable_seconds: 180,
      recording_url: 'https://storage.crm.local/tvc/call_001.mp3',
      hangup_cause: 'NORMAL_CLEARING',
      raw_payload: JSON.stringify({ answerTime: '2026-02-11T11:00:05Z' }),
      started_at: new Date('2026-02-11T11:00:00Z'),
      answered_at: new Date('2026-02-11T11:00:05Z'),
      ended_at: new Date('2026-02-11T11:03:00Z'),
    },
    {
      id: uuidv4(),
      call_id: 'CDR-FA-001',
      provider: 'MOCK_REST',
      direction: 'OUTBOUND',
      caller_number: '+91-1140001111',
      destination_number: '+91-9000000005',
      agent_id: USER_FA_ID,
      project_id: PROJECT_1_ID,
      module: 'FA',
      reference_id: 'dddd4444-4444-4444-4444-444444440001',
      status: 'COMPLETED',
      duration_seconds: 320,
      billable_seconds: 320,
      recording_url: 'https://storage.crm.local/fa/rec_fa_001.mp3',
      hangup_cause: 'NORMAL_CLEARING',
      raw_payload: JSON.stringify({ answerTime: '2026-02-11T16:00:06Z' }),
      started_at: new Date('2026-02-11T16:00:00Z'),
      answered_at: new Date('2026-02-11T16:00:06Z'),
      ended_at: new Date('2026-02-11T16:05:20Z'),
    },
    {
      id: uuidv4(),
      call_id: 'CDR-CATI-001',
      provider: 'MOCK_REST',
      direction: 'OUTBOUND',
      caller_number: '+91-1140001111',
      destination_number: '+91-9871100222',
      agent_id: USER_CATI_ID,
      project_id: PROJECT_1_ID,
      module: 'CATI',
      reference_id: '99999999-9999-9999-9999-999999990002',
      status: 'COMPLETED',
      duration_seconds: 735,
      billable_seconds: 735,
      recording_url: 'https://storage.crm.local/cati/rec_cati_002.mp3',
      hangup_cause: 'NORMAL_CLEARING',
      raw_payload: JSON.stringify({ answerTime: '2026-02-10T10:00:05Z' }),
      started_at: new Date('2026-02-10T10:00:00Z'),
      answered_at: new Date('2026-02-10T10:00:05Z'),
      ended_at: new Date('2026-02-10T10:12:15Z'),
    },
  ],

  // 11. Exams & Certifications
  exams: [
    {
      id: 'eeee5555-5555-5555-5555-555555550001',
      project_id: PROJECT_1_ID,
      title: 'Surveyor Field & Phone Interview Protocols 2026',
      description: 'Comprehensive certification examination for CATI and CAPI interviewers.',
      category: 'CATI',
      duration_minutes: 30,
      passing_percentage: 70.0,
      total_questions_to_ask: 5,
      shuffle_questions: true,
      allow_retake: true,
      max_attempts: 3,
      status: 'ACTIVE',
      metadata: JSON.stringify({ badge: 'CERTIFIED_ENUMERATOR' }),
      created_at: new Date('2026-01-25T00:00:00Z'),
      updated_at: new Date('2026-01-25T00:00:00Z'),
    },
  ],

  exam_questions: [
    {
      id: 'eeee5555-5555-5555-5555-555555551001',
      exam_id: 'eeee5555-5555-5555-5555-555555550001',
      question_text: 'What is the mandatory procedure when a respondent hesitates or refuses to disclose their voter choice?',
      question_type: 'SINGLE_CHOICE',
      options: JSON.stringify([
        { id: 'opt_1', text: 'Select a likely option based on their other responses' },
        { id: 'opt_2', text: 'Gently inform them that answers are anonymous and mark Undecided/Refused if they decline' },
        { id: 'opt_3', text: 'Terminate the call immediately without saving' },
      ]),
      correct_answers: JSON.stringify(['opt_2']),
      explanation: 'Enumerators must never fabricate answers or prompt selections under any circumstance.',
      points: 1.0,
      difficulty: 'EASY',
      is_common: false,
      category: 'ETHICS',
    },
    {
      id: 'eeee5555-5555-5555-5555-555555551002',
      exam_id: 'eeee5555-5555-5555-5555-555555550001',
      question_text: 'Which audio verification check is conducted by CAPI auditors?',
      question_type: 'SINGLE_CHOICE',
      options: JSON.stringify([
        { id: 'opt_1', text: 'Comparing audio timestamp with question responses for verbatim adherence' },
        { id: 'opt_2', text: 'Checking background noise volume only' },
        { id: 'opt_3', text: 'Calculating respondent tone frequency' },
      ]),
      correct_answers: JSON.stringify(['opt_1']),
      explanation: 'CAPI audits match question tags against audio recordings to detect mismatches.',
      points: 1.0,
      difficulty: 'MEDIUM',
      is_common: false,
      category: 'AUDIT',
    },
  ],

  exam_attempts: [
    {
      id: 'ffff6666-6666-6666-6666-666666660001',
      exam_id: 'eeee5555-5555-5555-5555-555555550001',
      user_id: USER_CATI_ID,
      start_time: new Date('2026-02-01T10:00:00Z'),
      end_time: new Date('2026-02-01T10:20:00Z'),
      time_limit_seconds: 1800,
      question_ids: JSON.stringify(['eeee5555-5555-5555-5555-555555551001', 'eeee5555-5555-5555-5555-555555551002']),
      score: 2.0,
      total_points: 2.0,
      percentage: 100.0,
      passed: true,
      status: 'GRADED',
      certificate_id: 'CERT-2026-CATI-0089',
      created_at: new Date('2026-02-01T10:00:00Z'),
    },
  ],

  exam_submissions: [],

  // 12. Geography Hierarchy
  geography_versions: [
    {
      id: '11110000-0000-0000-0000-000000000001',
      version_code: 'GEO-V2026-BASE',
      name: 'National Parliamentary & Assembly Delimitation Baseline 2026',
      description: 'Standard Delimitation Tree covering high-priority survey states, Lok Sabha PCs, Vidhan Sabha ACs and sample polling booths.',
      project_id: PROJECT_1_ID,
      is_active: true,
      total_nodes: 12,
      created_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],

  geography_nodes: [
    // States
    { id: '11111111-0000-0000-0000-000000000001', version_id: '11110000-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'STATE', code: 'UP', name: 'Uttar Pradesh', state_code: 'UP', district_name: 'Statewide', metadata: JSON.stringify({ total_pc: 80, total_ac: 403 }) },
    { id: '11111111-0000-0000-0000-000000000002', version_id: '11110000-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'STATE', code: 'MH', name: 'Maharashtra', state_code: 'MH', district_name: 'Statewide', metadata: JSON.stringify({ total_pc: 48, total_ac: 288 }) },
    { id: '11111111-0000-0000-0000-000000000003', version_id: '11110000-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'STATE', code: 'BR', name: 'Bihar', state_code: 'BR', district_name: 'Statewide', metadata: JSON.stringify({ total_pc: 40, total_ac: 243 }) },

    // Parliamentary Constituencies (PCs)
    { id: '22222222-0000-0000-0000-000000000001', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '11111111-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'PC', code: 'UP-PC-77', name: 'Varanasi', state_code: 'UP', pc_code: 'UP-PC-77', district_name: 'Varanasi', latitude: 25.3176, longitude: 82.9739 },
    { id: '22222222-0000-0000-0000-000000000002', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '11111111-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'PC', code: 'UP-PC-35', name: 'Lucknow', state_code: 'UP', pc_code: 'UP-PC-35', district_name: 'Lucknow', latitude: 26.8467, longitude: 80.9462 },
    { id: '22222222-0000-0000-0000-000000000003', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '11111111-0000-0000-0000-000000000002', project_id: PROJECT_1_ID, node_type: 'PC', code: 'MH-PC-31', name: 'Mumbai South', state_code: 'MH', pc_code: 'MH-PC-31', district_name: 'Mumbai', latitude: 18.9220, longitude: 72.8347 },
    { id: '22222222-0000-0000-0000-000000000004', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '11111111-0000-0000-0000-000000000003', project_id: PROJECT_1_ID, node_type: 'PC', code: 'BR-PC-30', name: 'Patna Sahib', state_code: 'BR', pc_code: 'BR-PC-30', district_name: 'Patna', latitude: 25.5941, longitude: 85.1376 },

    // Assembly Constituencies (ACs)
    { id: '33333333-0000-0000-0000-000000000001', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '22222222-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'AC', code: 'UP-AC-388', name: 'Varanasi South', state_code: 'UP', pc_code: 'UP-PC-77', ac_code: 'UP-AC-388', district_name: 'Varanasi' },
    { id: '33333333-0000-0000-0000-000000000002', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '22222222-0000-0000-0000-000000000002', project_id: PROJECT_1_ID, node_type: 'AC', code: 'UP-AC-174', name: 'Lucknow Central', state_code: 'UP', pc_code: 'UP-PC-35', ac_code: 'UP-AC-174', district_name: 'Lucknow' },
    { id: '33333333-0000-0000-0000-000000000003', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '22222222-0000-0000-0000-000000000003', project_id: PROJECT_1_ID, node_type: 'AC', code: 'MH-AC-187', name: 'Colaba', state_code: 'MH', pc_code: 'MH-PC-31', ac_code: 'MH-AC-187', district_name: 'Mumbai' },
    { id: '33333333-0000-0000-0000-000000000004', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '22222222-0000-0000-0000-000000000004', project_id: PROJECT_1_ID, node_type: 'AC', code: 'BR-AC-182', name: 'Bankipur', state_code: 'BR', pc_code: 'BR-PC-30', ac_code: 'BR-AC-182', district_name: 'Patna' },

    // Booths / SEPs
    { id: '44444444-0000-0000-0000-000000000001', version_id: '11110000-0000-0000-0000-000000000001', parent_id: '33333333-0000-0000-0000-000000000001', project_id: PROJECT_1_ID, node_type: 'SEP', code: 'SEP-VNS-101', name: 'Primary School Dashashwamedh Booth 101', state_code: 'UP', pc_code: 'UP-PC-77', ac_code: 'UP-AC-388', district_name: 'Varanasi', latitude: 25.3050, longitude: 83.0100 },
  ],

  // 13. Audit Logs
  audit_logs: [
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_ADMIN_ID,
      action: 'USER_LOGIN',
      resource: 'auth',
      resource_id: USER_ADMIN_ID,
      entity_type: 'users',
      entity_id: USER_ADMIN_ID,
      module: 'AUTH',
      old_values: null,
      new_values: JSON.stringify({ ip: '103.211.14.92', method: 'JWT_BEARER', status: 'SUCCESS' }),
      details: JSON.stringify({ ip: '103.211.14.92', method: 'JWT_BEARER' }),
      ip_address: '103.211.14.92',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0',
      created_at: new Date(Date.now() - 3600 * 1000 * 1),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_CAPI_ID,
      action: 'CAPI_SURVEY_COMPLETED',
      resource: 'submissions',
      resource_id: '99999999-9999-9999-9999-999999990001',
      entity_type: 'submission',
      entity_id: '99999999-9999-9999-9999-999999990001',
      module: 'CAPI',
      old_values: JSON.stringify({ status: 'IN_PROGRESS', answeredQuestions: 4 }),
      new_values: JSON.stringify({ status: 'COMPLETED', answeredQuestions: 5, gpsAccuracy: '4.2m', durationSeconds: 860 }),
      details: JSON.stringify({ submission_id: 'SUB-NVP-2026-0001', ac: 'Varanasi South', ward: 'Ward 4' }),
      ip_address: '157.34.192.44',
      user_agent: 'MasterCRM-FieldApp/v2.4 (Android 14; Galaxy Tab S9)',
      created_at: new Date(Date.now() - 3600 * 1000 * 2),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_CAPI_ID,
      action: 'CAPI_AUDIT_PASS',
      resource: 'capi_audits',
      resource_id: 'aaaa1111-1111-1111-1111-111111110001',
      entity_type: 'capi_audit',
      entity_id: 'aaaa1111-1111-1111-1111-111111110001',
      module: 'CAPI',
      old_values: JSON.stringify({ decision: 'PENDING', score: null }),
      new_values: JSON.stringify({ decision: 'PASS', score: 95.0, audioDuration: 860, audioQuality: 'EXCELLENT' }),
      details: JSON.stringify({ decision: 'PASS', score: 95.0, reviewerComment: 'Audio and GPS matched location' }),
      ip_address: '157.34.192.44',
      user_agent: 'MasterCRM-FieldApp/v2.4 (Android 14)',
      created_at: new Date(Date.now() - 3600 * 1000 * 3),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_SUPER_ID,
      action: 'SUPER_AUDIT_APPROVE',
      resource: 'super_audits',
      resource_id: 'sa-001',
      entity_type: 'super_audit',
      entity_id: '99999999-9999-9999-9999-999999990001',
      module: 'SUPER_AUDIT',
      old_values: JSON.stringify({ super_audit_status: 'PENDING' }),
      new_values: JSON.stringify({ super_audit_status: 'APPROVED', superAuditScore: 98, verifiedByAi: true }),
      details: JSON.stringify({ approvedBy: 'Vikram Saxena', verifiedByAi: true }),
      ip_address: '49.36.88.12',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      created_at: new Date(Date.now() - 3600 * 1000 * 4),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_CATI_ID,
      action: 'CATI_CALL_CONNECTED',
      resource: 'dialer',
      resource_id: 'call-20260210-001',
      entity_type: 'call',
      entity_id: 'call-20260210-001',
      module: 'CATI',
      old_values: JSON.stringify({ callState: 'DIALING' }),
      new_values: JSON.stringify({ callState: 'CONNECTED', duration: 180, respondent: 'Rajesh Kumar' }),
      details: JSON.stringify({ trunk: 'SIP-TRUNK-01', ac: 'Varanasi', voterPhone: '+91-9871100111' }),
      ip_address: '122.161.45.19',
      user_agent: 'MasterCRM-WebDialer/1.0',
      created_at: new Date(Date.now() - 3600 * 1000 * 5),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_TVC_ID,
      action: 'TVC_VERIFICATION_COMPLETE',
      resource: 'tvc',
      resource_id: 'tvc-001',
      entity_type: 'tvc_record',
      entity_id: '99999999-9999-9999-9999-999999990001',
      module: 'TVC',
      old_values: JSON.stringify({ tvc_status: 'QUEUED' }),
      new_values: JSON.stringify({ tvc_status: 'VERIFIED', matchPercentage: 100, respondentConfirmed: true }),
      details: JSON.stringify({ verifier: 'Neha Sharma', notes: 'Respondent confirmed survey answers' }),
      ip_address: '122.161.45.22',
      user_agent: 'MasterCRM-TVC/1.0',
      created_at: new Date(Date.now() - 3600 * 1000 * 6),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_ADMIN_ID,
      action: 'USER_ROLE_ASSIGNED',
      resource: 'users',
      resource_id: USER_CAPI_ID,
      entity_type: 'users',
      entity_id: USER_CAPI_ID,
      module: 'USERS',
      old_values: JSON.stringify({ role: 'VIEWER' }),
      new_values: JSON.stringify({ role: 'CAPI_AUDITOR', vendorId: VENDOR_1_ID }),
      details: JSON.stringify({ assignedBy: 'Raj Singhania', scope: 'Field Operations' }),
      ip_address: '103.211.14.92',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_at: new Date(Date.now() - 3600 * 1000 * 7),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_PM_ID,
      action: 'CAMPAIGN_RULES_UPDATED',
      resource: 'rules_engine',
      resource_id: 'RULE_AUDIO_DURATION',
      entity_type: 'rules',
      entity_id: 'RULE_AUDIO_DURATION',
      module: 'RULES_ENGINE',
      old_values: JSON.stringify({ minSeconds: 180 }),
      new_values: JSON.stringify({ minSeconds: 300, flagBehavior: 'AUTO_FLAG_SUSPICIOUS' }),
      details: JSON.stringify({ rule: 'RULE_AUDIO_DURATION', updatedBy: 'Pooja Kashyap' }),
      ip_address: '115.240.89.15',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_at: new Date(Date.now() - 3600 * 1000 * 8),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_ADMIN_ID,
      action: 'FORM_IMPORT_SUCCESS',
      resource: 'form_engine',
      resource_id: 'IMPORT-2026-001',
      entity_type: 'questionnaire',
      entity_id: QV_1_ID,
      module: 'FORM_ENGINE',
      old_values: null,
      new_values: JSON.stringify({ totalQuestions: 48, languages: ['hi', 'mr', 'en'], status: 'VALIDATED' }),
      details: JSON.stringify({ filename: 'National_Voter_Survey_Core_v1.xlsx', sheetsProcessed: 4 }),
      ip_address: '103.211.14.92',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_at: new Date(Date.now() - 3600 * 1000 * 9),
    },
    {
      id: uuidv4(),
      organization_id: ORG_ID,
      user_id: USER_VENDOR_ID,
      action: 'EXPORT_AUDIT_CSV',
      resource: 'reports',
      resource_id: 'export-csv-001',
      entity_type: 'reports',
      entity_id: PROJECT_1_ID,
      module: 'REPORTS',
      old_values: null,
      new_values: JSON.stringify({ format: 'CSV', recordCount: 1540, exportRange: 'LAST_7_DAYS' }),
      details: JSON.stringify({ exportedBy: 'Suresh Reddy', vendor: 'PRIME' }),
      ip_address: '182.74.15.2',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_at: new Date(Date.now() - 3600 * 1000 * 10),
    },
  ],

  // 14. Rules
  rule_definitions: [
    {
      id: uuidv4(),
      project_id: PROJECT_1_ID,
      rule_code: 'RULE_AUDIO_DURATION',
      name: 'Minimum Audio Duration Check',
      module: 'CAPI',
      trigger_event: 'SUBMISSION_COMPLETED',
      expression: 'json(payload.audio_duration) >= 300',
      action: 'FLAG_SHORT_AUDIO',
      is_active: true,
      priority: 10,
    },
  ],

  // 15. Field CATI
  field_cati_assignments: [
    {
      id: uuidv4(),
      surveyor_id: USER_CATI_ID,
      project_id: PROJECT_1_ID,
      state_id: 'UP',
      target_count: 50,
      completed_count: 12,
      status: 'ACTIVE',
      assigned_at: new Date(),
    },
  ],
  gps_events: [],
  sync_logs: [],

  // 16. Realtime
  realtime_sessions: [
    {
      id: 'sess-mock-01',
      user_id: USER_CATI_ID,
      vendor_id: VENDOR_1_ID,
      project_id: PROJECT_1_ID,
      channel: 'CATI',
      role: 'CATI Agent',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'CATI Live Telephony Wave 3 Dialing & Voter Polling',
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 3.2,
      address: 'AC-21 Karol Bagh, Dev Nagar Sector 2',
      locationName: 'AC-21 Karol Bagh, Dev Nagar Sector 2',
      batteryLevel: 98,
      deviceId: 'Chrome 122 • Windows 11 Enterprise',
      deviceType: 'Desktop',
      os: 'Windows 11',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T08:00:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:15:00Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:15:00Z').toISOString(),
    },
    {
      id: 'sess-mock-02',
      user_id: USER_CAPI_ID,
      vendor_id: VENDOR_1_ID,
      project_id: PROJECT_1_ID,
      channel: 'CAPI',
      role: 'CAPI Auditor',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'Conducting CAPI Survey - Household Sample #104',
      latitude: 26.4499,
      longitude: 80.3319,
      accuracy: 4.2,
      address: 'AC-213 Govind Nagar, Ward 9, Kanpur',
      locationName: 'AC-213 Govind Nagar, Ward 9, Kanpur',
      batteryLevel: 92,
      deviceId: 'Android 14 • Samsung Galaxy Tab S9',
      deviceType: 'Tablet',
      os: 'Android 14',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T08:15:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:14:45Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:14:45Z').toISOString(),
    },
    {
      id: 'sess-mock-03',
      user_id: USER_SUPER_ID,
      vendor_id: VENDOR_2_ID,
      project_id: PROJECT_1_ID,
      channel: 'CAPI',
      role: 'Super Auditor',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'Super Auditor Physical Re-check Sample #56',
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 3.5,
      address: 'AC-168 Chandivali, Powai Zone 3',
      locationName: 'AC-168 Chandivali, Powai Zone 3',
      batteryLevel: 95,
      deviceId: 'iOS 17.4 • Apple iPad Air M2',
      deviceType: 'Tablet',
      os: 'iOS 17.4',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T07:45:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:14:30Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:14:30Z').toISOString(),
    },
    {
      id: 'sess-mock-04',
      user_id: USER_TVC_ID,
      vendor_id: VENDOR_1_ID,
      project_id: PROJECT_1_ID,
      channel: 'TVC',
      role: 'TVC Verifier',
      state: 'IDLE',
      status: 'IDLE',
      currentAction: 'Reviewing Respondent Call Schedule & In Transit',
      latitude: 25.5941,
      longitude: 85.1376,
      accuracy: 4.5,
      address: 'AC-182 Patna Sahib, Kankarbagh Colony Sector 4',
      locationName: 'AC-182 Patna Sahib, Kankarbagh Colony Sector 4',
      batteryLevel: 68,
      deviceId: 'Android 14 • Samsung Galaxy Tab S8+',
      deviceType: 'Tablet',
      os: 'Android 14',
      idleDuration: 360,
      connected_at: new Date('2026-10-26T08:30:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:09:00Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:09:00Z').toISOString(),
    },
    {
      id: 'sess-mock-05',
      user_id: USER_FA_ID,
      vendor_id: VENDOR_1_ID,
      project_id: PROJECT_1_ID,
      channel: 'FA',
      role: 'Feedback Agent (FA)',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'Feedback Assessment & Field Surveyor Coaching',
      latitude: 18.5204,
      longitude: 73.8567,
      accuracy: 4.8,
      address: 'AC-214 Pune Cantt, Camp Area Ward 11',
      locationName: 'AC-214 Pune Cantt, Camp Area Ward 11',
      batteryLevel: 82,
      deviceId: 'Android 14 • Google Pixel Tablet',
      deviceType: 'Tablet',
      os: 'Android 14',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T09:00:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:14:15Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:14:15Z').toISOString(),
    },
    {
      id: 'sess-mock-06',
      user_id: USER_PM_ID,
      vendor_id: null,
      project_id: PROJECT_1_ID,
      channel: 'PORTAL',
      role: 'Project Manager',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'Live Field Operations Monitoring & Dispatch',
      latitude: 26.8467,
      longitude: 80.9462,
      accuracy: 3.8,
      address: 'AC-171 Lucknow Cantt, Hazratganj Sector B',
      locationName: 'AC-171 Lucknow Cantt, Hazratganj Sector B',
      batteryLevel: 84,
      deviceId: 'Android 14 • Xiaomi Pad 6 Max',
      deviceType: 'Tablet',
      os: 'Android 14',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T08:00:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:14:50Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:14:50Z').toISOString(),
    },
    {
      id: 'sess-mock-07',
      user_id: USER_VENDOR_ID,
      vendor_id: VENDOR_1_ID,
      project_id: PROJECT_1_ID,
      channel: 'PORTAL',
      role: 'Vendor Administrator',
      state: 'IDLE',
      status: 'IDLE',
      currentAction: 'Vendor Quota Review / Standby',
      latitude: 25.4358,
      longitude: 81.8463,
      accuracy: 5.6,
      address: 'AC-260 Allahabad West, Civil Lines Zone 2',
      locationName: 'AC-260 Allahabad West, Civil Lines Zone 2',
      batteryLevel: 71,
      deviceId: 'Android 13 • Samsung Galaxy A54 5G',
      deviceType: 'Mobile',
      os: 'Android 13',
      idleDuration: 420,
      connected_at: new Date('2026-10-26T08:10:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:08:00Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:08:00Z').toISOString(),
    },
    {
      id: 'sess-mock-08',
      user_id: USER_ADMIN_ID,
      vendor_id: null,
      project_id: PROJECT_1_ID,
      channel: 'PORTAL',
      role: 'Master Administrator',
      state: 'ACTIVE',
      status: 'ACTIVE',
      currentAction: 'System Administrative Control & Workforce Radar Inspection',
      latitude: 28.6139,
      longitude: 77.2090,
      accuracy: 3.0,
      address: 'HQ Central Control Tower, New Delhi',
      locationName: 'HQ Central Control Tower, New Delhi',
      batteryLevel: 100,
      deviceId: 'Chrome 122 • Windows 11 Enterprise',
      deviceType: 'Desktop',
      os: 'Windows 11',
      idleDuration: 0,
      connected_at: new Date('2026-10-26T07:30:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T10:15:00Z').toISOString(),
      lastPingAt: new Date('2026-10-26T10:15:00Z').toISOString(),
    },
    {
      id: 'sess-mock-09',
      user_id: USER_CLIENT_ID,
      vendor_id: null,
      project_id: PROJECT_2_ID,
      channel: 'PORTAL',
      role: 'Client Administrator',
      state: 'OFFLINE',
      status: 'OFFLINE',
      currentAction: 'Shift Concluded / Client Dashboard Closed',
      latitude: null,
      longitude: null,
      accuracy: null,
      address: 'Client Governance Regional Center, Mumbai',
      locationName: 'Client Governance Regional Center, Mumbai',
      batteryLevel: 45,
      deviceId: 'Chrome 121 • macOS Sonoma',
      deviceType: 'Desktop',
      os: 'macOS',
      idleDuration: 7200,
      connected_at: new Date('2026-10-26T06:00:00Z').toISOString(),
      last_heartbeat_at: new Date('2026-10-26T08:15:00Z').toISOString(),
      lastPingAt: new Date('2026-10-26T08:15:00Z').toISOString(),
    },
  ],
  activity_events: [],


  // 17. AI Audits
  ai_audits: [],
  audio_segments: [],
  risk_evaluations: [],
  fraud_signals: [
    {
      id: 'SIG-1049',
      type: 'PROXY_USER_ALERT',
      submission_id: 'SUB-WB-ALIPURDUAR-2026-001',
      agentId: USER_CATI_ID,
      agentName: 'Rahul Verma',
      agentCode: 'STX-U1001',
      campaign: 'West Bengal Assembly Election Track',
      confidenceScore: 94.6,
      severity: 'critical',
      detectedAt: '12 mins ago',
      detail: 'Voice biometric mismatch: Captured call audio matches unregistered male speaker (cosine similarity 0.31 vs enrolled profile 0.88). Possible proxy caller.',
      status: 'pending',
      created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    },
    {
      id: 'SIG-1048',
      type: 'CROSS_AGENT_COLLISION',
      submission_id: 'SUB-WB-PURBA-002',
      agentId: `${USER_CATI_ID} / ${USER_TVC_ID}`,
      agentName: 'Rahul Verma & Neha Sharma',
      agentCode: 'STX-U1001 / STX-U1004',
      campaign: 'National Pre-Poll Opinion Survey 2026',
      confidenceScore: 89.2,
      severity: 'critical',
      detectedAt: '34 mins ago',
      detail: 'Identical vocal tract resonance (Formant F1/F2 collision 92.8%) detected across two distinct agent credentials conducting parallel field calls.',
      status: 'flagged',
      created_at: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
    },
    {
      id: 'SIG-1047',
      type: 'REPEATED_RESPONDENT_CLUSTER',
      submission_id: 'SUB-WB-JALPAIGURI-003',
      agentId: USER_CAPI_ID,
      agentName: 'Anjali Mehta',
      agentCode: 'STX-U1002',
      campaign: 'Rural Beneficiary Welfare Census',
      confidenceScore: 81.5,
      severity: 'high',
      detectedAt: '2 hours ago',
      detail: 'The same respondent voice detected across 11 different interviews within 48 hours (Collusion ring or ghost respondent loop).',
      status: 'pending',
      created_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    },
    {
      id: 'SIG-1046',
      type: 'AI_SYNTHETIC_VOICE',
      submission_id: 'SUB-WB-MALDA-004',
      agentId: USER_FA_ID,
      agentName: 'Karan Joshi',
      agentCode: 'STX-U1005',
      campaign: 'Urban Citizen Services & Governance QA',
      confidenceScore: 76.4,
      severity: 'medium',
      detectedAt: '5 hours ago',
      detail: 'Unnatural spectral pitch stability detected (F0 variance < 0.02%); high probability of TTS robot or AI voice cloning playback.',
      status: 'resolved',
      created_at: new Date(Date.now() - 300 * 60 * 1000).toISOString(),
    },
  ],
  voice_profiles: [
    {
      id: 'VP-001',
      user_id: USER_CATI_ID,
      agent_id: USER_CATI_ID,
      agent_name: 'Rahul Verma',
      full_name: 'Rahul Verma',
      role: 'CATI_AGENT',
      audio_url: '/uploads/voice-baselines/rahul_verma_baseline.wav',
      sample_audio_url: '/uploads/voice-baselines/rahul_verma_baseline.wav',
      embedding_dimension: 512,
      sample_duration_sec: 18,
      sample_snr_db: 32.5,
      snr_db: 32.5,
      pitch_f0: 168.4,
      status: 'ACTIVE',
      enrolled_by: USER_ADMIN_ID,
      created_at: new Date('2026-02-01T10:00:00Z'),
      updated_at: new Date('2026-02-01T10:00:00Z'),
      metadata: JSON.stringify({ qualityScore: 92.5, pitchF0: 168.4, formants: [540, 1680, 2450] }),
    },
    {
      id: 'VP-002',
      user_id: USER_CAPI_ID,
      agent_id: USER_CAPI_ID,
      agent_name: 'Anjali Mehta',
      full_name: 'Anjali Mehta',
      role: 'CAPI_AUDITOR',
      audio_url: '/uploads/voice-baselines/anjali_mehta_baseline.wav',
      sample_audio_url: '/uploads/voice-baselines/anjali_mehta_baseline.wav',
      embedding_dimension: 512,
      sample_duration_sec: 22,
      sample_snr_db: 34.1,
      snr_db: 34.1,
      pitch_f0: 215.2,
      status: 'ACTIVE',
      enrolled_by: USER_ADMIN_ID,
      created_at: new Date('2026-02-02T11:30:00Z'),
      updated_at: new Date('2026-02-02T11:30:00Z'),
      metadata: JSON.stringify({ qualityScore: 94.0, pitchF0: 215.2, formants: [680, 2100, 2820] }),
    },
    {
      id: 'VP-003',
      user_id: USER_SUPER_ID,
      agent_id: USER_SUPER_ID,
      agent_name: 'Vikram Saxena',
      full_name: 'Vikram Saxena',
      role: 'SUPER_AUDITOR',
      audio_url: '/uploads/voice-baselines/vikram_saxena_baseline.wav',
      sample_audio_url: '/uploads/voice-baselines/vikram_saxena_baseline.wav',
      embedding_dimension: 512,
      sample_duration_sec: 20,
      sample_snr_db: 35.0,
      snr_db: 35.0,
      pitch_f0: 145.8,
      status: 'ACTIVE',
      enrolled_by: USER_ADMIN_ID,
      created_at: new Date('2026-02-03T14:15:00Z'),
      updated_at: new Date('2026-02-03T14:15:00Z'),
      metadata: JSON.stringify({ qualityScore: 96.0, pitchF0: 145.8, formants: [490, 1550, 2380] }),
    },
  ],

  // AI Voice Fraud & Biometric Speaker Baseline Profiles
  agent_voice_profiles: [
    {
      id: '77777777-1111-4444-8888-000000000001',
      agent_id: USER_CATI_ID,
      agent_name: 'Rahul Verma',
      role: 'CATI_AGENT',
      audio_url: '/uploads/voice-baselines/rahul_verma_baseline.wav',
      storage_path: 'uploads/voice-baselines/rahul_verma_baseline.wav',
      embedding: JSON.stringify({
        dimension: 512,
        mfccSummary: [12.4, -3.2, 5.1, -1.8, 0.9, -0.4, 2.1, 0.7, -1.1, 0.3, 0.8, -0.2, 0.5],
        pitchF0Mean: 168.4,
        pitchF0Std: 14.2,
        formants: { f1: 540, f2: 1680, f3: 2450 },
        spectralCentroid: 1820.5,
        energyRms: 0.084,
      }),
      sample_duration_sec: 18.5,
      snr_db: 32.5,
      pitch_f0: 168.4,
      enrolled_by: USER_ADMIN_ID,
      status: 'ACTIVE',
      metadata: { qualityScore: 92.5, enrollMethod: 'DIRECT_MIC_SAMPLE', sampleRate: 44100 },
      created_at: new Date('2026-02-01T10:00:00Z'),
      updated_at: new Date('2026-02-01T10:00:00Z'),
    },
    {
      id: '77777777-1111-4444-8888-000000000002',
      agent_id: USER_CAPI_ID,
      agent_name: 'Anjali Mehta',
      role: 'CAPI_AUDITOR',
      audio_url: '/uploads/voice-baselines/anjali_mehta_baseline.wav',
      storage_path: 'uploads/voice-baselines/anjali_mehta_baseline.wav',
      embedding: JSON.stringify({
        dimension: 512,
        mfccSummary: [14.1, -4.5, 6.2, -2.1, 1.2, -0.6, 2.8, 0.9, -1.4, 0.5, 0.9, -0.3, 0.6],
        pitchF0Mean: 215.2,
        pitchF0Std: 18.6,
        formants: { f1: 680, f2: 2100, f3: 2820 },
        spectralCentroid: 2240.1,
        energyRms: 0.092,
      }),
      sample_duration_sec: 22.0,
      snr_db: 34.1,
      pitch_f0: 215.2,
      enrolled_by: USER_ADMIN_ID,
      status: 'ACTIVE',
      metadata: { qualityScore: 94.0, enrollMethod: 'AUDIO_FILE_UPLOAD', sampleRate: 48000 },
      created_at: new Date('2026-02-02T11:30:00Z'),
      updated_at: new Date('2026-02-02T11:30:00Z'),
    },
    {
      id: '77777777-1111-4444-8888-000000000003',
      agent_id: USER_SUPER_ID,
      agent_name: 'Vikram Saxena',
      role: 'SUPER_AUDITOR',
      audio_url: '/uploads/voice-baselines/vikram_saxena_baseline.wav',
      storage_path: 'uploads/voice-baselines/vikram_saxena_baseline.wav',
      embedding: JSON.stringify({
        dimension: 512,
        mfccSummary: [11.8, -2.9, 4.8, -1.5, 0.7, -0.3, 1.9, 0.6, -0.9, 0.2, 0.7, -0.1, 0.4],
        pitchF0Mean: 145.8,
        pitchF0Std: 11.4,
        formants: { f1: 490, f2: 1550, f3: 2380 },
        spectralCentroid: 1650.3,
        energyRms: 0.079,
      }),
      sample_duration_sec: 20.0,
      snr_db: 35.0,
      pitch_f0: 145.8,
      enrolled_by: USER_ADMIN_ID,
      status: 'ACTIVE',
      metadata: { qualityScore: 96.0, enrollMethod: 'DIRECT_MIC_SAMPLE', sampleRate: 44100 },
      created_at: new Date('2026-02-03T14:15:00Z'),
      updated_at: new Date('2026-02-03T14:15:00Z'),
    },
    {
      id: '77777777-1111-4444-8888-000000000004',
      agent_id: USER_TVC_ID,
      agent_name: 'Neha Sharma',
      role: 'TVC_AGENT',
      audio_url: '/uploads/voice-baselines/neha_sharma_baseline.wav',
      storage_path: 'uploads/voice-baselines/neha_sharma_baseline.wav',
      embedding: JSON.stringify({
        dimension: 512,
        mfccSummary: [13.2, -3.8, 5.7, -1.9, 1.1, -0.5, 2.3, 0.8, -1.2, 0.4, 0.8, -0.2, 0.5],
        pitchF0Mean: 228.6,
        pitchF0Std: 19.1,
        formants: { f1: 710, f2: 2180, f3: 2890 },
        spectralCentroid: 2310.8,
        energyRms: 0.088,
      }),
      sample_duration_sec: 19.2,
      snr_db: 33.8,
      pitch_f0: 228.6,
      enrolled_by: USER_ADMIN_ID,
      status: 'ACTIVE',
      metadata: { qualityScore: 93.5, enrollMethod: 'AUDIO_FILE_UPLOAD', sampleRate: 44100 },
      created_at: new Date('2026-02-04T12:00:00Z'),
      updated_at: new Date('2026-02-04T12:00:00Z'),
    },
  ],

  // Dedicated Voice Fraud Detection Incident Records
  voice_fraud_records: [
    {
      id: '88888888-1111-4444-9999-000000000001',
      lead_id: 'SUB-2026-00101',
      project_id: PROJECT_1_ID,
      agent_id: USER_CATI_ID,
      agent_name: 'Rahul Verma',
      fraud_type: 'VOICE_MISMATCH',
      confidence_score: 0.94,
      similarity_score: 0.28,
      status: 'CONFIRMED_FRAUD',
      recording_url: '/uploads/recordings/lead_sub_00101_call.wav',
      baseline_audio_url: '/uploads/voice-baselines/rahul_verma_baseline.wav',
      details: {
        reason: 'CRITICAL: Live caller voice does NOT match Rahul Verma biometric baseline profile (acoustic similarity 28.0% vs 70.0% threshold).',
        discrepancyType: 'PROXY_SPEAKER_SUBSTITUTION',
        baselinePitchF0: 168.4,
        observedPitchF0: 232.1,
        acousticDistance: 0.72,
        detectedChannel: 'INTERVIEWER_CALLER_CHANNEL',
        snrDb: 28.4,
        diarizationSpeakers: 2,
        notes: 'Outbound survey conducted by an unauthorized third-party male proxy instead of enrolled agent.',
      },
      notes: 'Fraud verified by Super Admin. Agent issued formal penalty warning.',
      resolved_by: USER_ADMIN_ID,
      resolved_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
      created_at: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
      updated_at: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
    },
    {
      id: '88888888-1111-4444-9999-000000000002',
      lead_id: 'SUB-2026-00204',
      project_id: PROJECT_1_ID,
      agent_id: USER_CATI_ID,
      agent_name: 'Rahul Verma',
      fraud_type: 'SELF_INTERVIEW_MIMICRY',
      confidence_score: 0.96,
      similarity_score: 0.92,
      status: 'UNDER_REVIEW',
      recording_url: '/uploads/recordings/lead_sub_00204_call.wav',
      baseline_audio_url: '/uploads/voice-baselines/rahul_verma_baseline.wav',
      details: {
        reason: 'CRITICAL: Agent detected impersonating respondent with pitch-altered voice tone. Both interviewer and respondent audio channels share identical vocal tract resonances (F2/F1 formant overlap: 91.8%).',
        discrepancyType: 'SELF_INTERVIEW_TONE_CHANGE',
        interviewerFormants: [542, 1675, 2460],
        respondentFormants: [538, 1682, 2445],
        formantOverlapPercentage: 91.8,
        pitchShiftDetected: true,
        pitchShiftSemitones: 3.2,
        speakerCadenceCorrelation: 0.89,
        notes: 'Agent answers own survey questions by modulating voice pitch to simulate female/elderly respondent.',
      },
      notes: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
      updated_at: new Date(Date.now() - 3600 * 1000 * 6).toISOString(),
    },
    {
      id: '88888888-1111-4444-9999-000000000003',
      lead_id: 'SUB-2026-00318',
      project_id: PROJECT_1_ID,
      agent_id: USER_FA_ID,
      agent_name: 'Karan Joshi',
      fraud_type: 'BASELINE_VOICE_MISSING',
      confidence_score: 0.85,
      similarity_score: null,
      status: 'UNDER_REVIEW',
      recording_url: '/uploads/recordings/lead_sub_00318_call.wav',
      baseline_audio_url: null,
      details: {
        reason: 'MANDATORY ENROLLMENT MISSING: Agent Karan Joshi has not enrolled a baseline biometric voice sample in CRM. AI Audit cannot authenticate speaker authenticity.',
        discrepancyType: 'UNENROLLED_AGENT_CALL',
        actionRequired: 'Super Admin or Agent must submit a 15-second baseline voice audio profile to enable automated clearance.',
      },
      notes: null,
      resolved_by: null,
      resolved_at: null,
      created_at: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      updated_at: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
    },
    {
      id: '88888888-1111-4444-9999-000000000004',
      lead_id: 'SUB-2026-00155',
      project_id: PROJECT_1_ID,
      agent_id: USER_CAPI_ID,
      agent_name: 'Anjali Mehta',
      fraud_type: 'VOICE_MISMATCH',
      confidence_score: 0.72,
      similarity_score: 0.64,
      status: 'DISMISSED',
      recording_url: '/uploads/recordings/lead_sub_00155_call.wav',
      baseline_audio_url: '/uploads/voice-baselines/anjali_mehta_baseline.wav',
      details: {
        reason: 'Marginal similarity drop (64.2% vs 70.0% threshold) caused by cellular network 2G packet compression and ambient traffic noise (SNR: 13.8 dB).',
        discrepancyType: 'FALSE_POSITIVE_NOISE_LINE',
        snrDb: 13.8,
        baselinePitchF0: 215.2,
        observedPitchF0: 210.8,
      },
      notes: 'Reviewed manually by Admin: Line was noisy but vocal inflections and accent clearly belong to Anjali Mehta. Dismissed as false positive.',
      resolved_by: USER_ADMIN_ID,
      resolved_at: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      created_at: new Date(Date.now() - 3600 * 1000 * 20).toISOString(),
      updated_at: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
    },
  ],

  // 18. Subscriptions & Billing
  subscriptions: [
    {
      id: '99990000-0000-0000-0000-000000000001',
      organization_id: ORG_ID,
      plan_name: 'ENTERPRISE',
      base_price: 499.00,
      ai_audit_price: 199.00,
      total_price: 698.00,
      currency: 'USD',
      has_ai_audit: true,
      billing_cycle: 'ANNUAL',
      start_date: new Date('2026-01-01T00:00:00Z'),
      end_date: new Date('2027-01-01T00:00:00Z'),
      status: 'ACTIVE',
      auto_renew: true,
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],
  subscription_invoices: [
    {
      id: '99990000-0000-0000-0000-000000000002',
      subscription_id: '99990000-0000-0000-0000-000000000001',
      organization_id: ORG_ID,
      invoice_number: 'INV-2026-100001',
      receipt_number: 'RCP-2026-100001',
      base_amount: 499.00,
      ai_audit_amount: 199.00,
      tax_amount: 125.64,
      total_amount: 823.64,
      currency: 'USD',
      payment_status: 'PAID',
      payment_method: 'CREDIT_CARD',
      paid_at: new Date('2026-01-01T00:00:00Z'),
      receipt_data: {
        invoiceNumber: 'INV-2026-100001',
        receiptNumber: 'RCP-2026-100001',
        organization: { id: ORG_ID, name: 'PollyPulse Analytics Group' },
        plan: 'ENTERPRISE',
        billingCycle: 'ANNUAL',
        totalPaid: 823.64,
      },
      created_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],
  subscription_pricing: [
    {
      id: 'default',
      base_price: 499.00,
      ai_audit_price: 199.00,
      currency: 'USD',
      updated_at: new Date(),
    },
  ],

  // 19. Client DB Sync
  client_db_sync_configs: [
    {
      id: 'cfg-default-01',
      organization_id: ORG_ID,
      name: 'Organization Primary PostgreSQL',
      db_type: 'POSTGRES',
      connection_string: 'postgresql://reflect_owner:***@ep-orange-hall-a5k6qfw8-pooler.us-east-2.aws.neon.tech:5432/crm?sslmode=require',
      api_url: null,
      api_token: null,
      sync_interval: '15_MIN',
      is_active: true,
      status: 'IDLE',
      records_synced: 1842,
      last_synced_at: new Date(),
      last_error: null,
      mapping_config: {
        dbConfig: {
          host: 'ep-orange-hall-a5k6qfw8-pooler.us-east-2.aws.neon.tech',
          port: 5432,
          database: 'crm',
          user: 'reflect_owner',
          sslMode: 'require',
          dbType: 'POSTGRES',
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    },
  ],
  client_db_sync_logs: [],

  // 20. Stelleronix Multi-Tenant Licensing & Concurrency Control
  organization_licenses: [
    {
      id: 'lic-01',
      organization_id: ORG_ID,
      max_created_users: 200,
      max_concurrent_human_seats: 5,
      audit_ai_licenses: 2,
      voice_ai_licenses: 1,
      enable_ai_audit: true,
      enabled_modules: ['CAPI', 'CATI', 'TVC', 'FA', 'SUPER_AUDIT'],
      license_status: 'ACTIVE',
      validity_start: '2026-01-01',
      validity_end: '2027-01-01',
      created_at: new Date('2026-01-01T00:00:00Z'),
      updated_at: new Date('2026-01-01T00:00:00Z'),
    },
  ],

  active_seat_leases: [
    // Live atomic seat leases currently held by active human sessions
  ],

  // 21. Multi-Campaign Reusable User Identity & Scoped Roles
  user_campaign_assignments: [],
  user_documents: [
    {
      id: 'doc-01',
      user_id: USER_CATI_ID,
      document_type: 'IDENTITY_PROOF',
      document_name: 'Govt_Voter_ID_Card.pdf',
      status: 'VERIFIED',
      verified_by: USER_ADMIN_ID,
      verified_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'doc-02',
      user_id: USER_CATI_ID,
      document_type: 'VENDOR_AUTHORIZATION',
      document_name: 'PrimeField_Appointment_Letter.pdf',
      status: 'VERIFIED',
      verified_by: USER_ADMIN_ID,
      verified_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'doc-03',
      user_id: USER_CATI_ID,
      document_type: 'NDA_CONFIDENTIALITY',
      document_name: 'Signed_Data_Privacy_NDA.pdf',
      status: 'VERIFIED',
      verified_by: USER_ADMIN_ID,
      verified_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'doc-04',
      user_id: USER_CATI_ID,
      document_type: 'TRAINING_CERTIFICATE',
      document_name: 'CATI_Telephony_Exam_Certificate.pdf',
      status: 'VERIFIED',
      verified_by: USER_ADMIN_ID,
      verified_at: new Date('2026-02-01T00:00:00Z'),
    },
  ],

  // 23. AI Agent Allocations per Campaign
  ai_agent_allocations: [
    {
      id: 'ai-alloc-01',
      organization_id: ORG_ID,
      campaign_id: PROJECT_1_ID,
      ai_type: 'AUDIT_AI',
      allocated_slots: 2,
      processing_mode: 'HUMAN_WITH_AI_ASSIST',
      status: 'ACTIVE',
      created_at: new Date('2026-02-01T00:00:00Z'),
    },
    {
      id: 'ai-alloc-02',
      organization_id: ORG_ID,
      campaign_id: PROJECT_1_ID,
      ai_type: 'VOICE_AI',
      allocated_slots: 1,
      processing_mode: 'AI_FIRST_HUMAN_REVIEW',
      status: 'ACTIVE',
      created_at: new Date('2026-02-01T00:00:00Z'),
    },
  ],

  // 23. Operational Agent Breaks & Productivity
  agent_breaks: [],
};

// ============================================================================
// AUTOMATICALLY SEED CLIENT 5 AUDIT RECORDS
// ============================================================================
try {
  const _clientRecs = require('./client_5_audit_records.json');
  if (Array.isArray(_clientRecs)) {
    _clientRecs.forEach((rec, idx) => {
      const subId = 'client-sub-' + (idx + 1);
      const saId = 'client-sa-' + (idx + 1);
      const capiId = 'client-capi-' + (idx + 1);

      if (!store.submissions.some(s => s.id === subId)) {
        store.submissions.push({
          id: subId,
          submission_id: rec.submission_id,
          project_id: PROJECT_1_ID,
          vendor_id: VENDOR_1_ID,
          state_id: 'BR',
          source_channel: 'CAPI',
          source_agent_id: USER_CAPI_ID,
          source_device_id: 'DEV-CAPI-' + (rec.fa || idx + 1),
          source_call_id: null,
          questionnaire_version_id: QV_1_ID,
          respondent_name: rec.full_name || 'Respondent ' + (idx + 1),
          respondent_phone: rec.phone_no || '9876543210',
          respondent_metadata: JSON.stringify({
            ac_num: rec.ac_num,
            ac_name: rec.ac_name,
            age: rec.age,
            gender: rec.gender,
            caste: rec.caste,
            fa: rec.fa,
            collector_emailid: rec.collector_emailid,
            tl_id: rec.tl_id,
            duration: rec.duration,
            batch_slot: rec.batch_slot,
            dumping_date: rec.dumping_date,
            religion: rec.religion,
            introduction: rec.introduction,
            mla_choice: rec.mla_choice,
            voting_intention_vs_party: rec.voting_intention_vs_party,
            cm_choice: rec.cm_choice,
            pm_satisfaction: rec.pm_satisfaction,
            cm_satisfaction: rec.cm_satisfaction,
            mla_awareness: rec.mla_awareness,
            mla_satisfaction: rec.mla_satisfaction,
            state_govt_change: rec.state_govt_change,
            winner_perception_state: rec.winner_perception_state,
            major_problems: rec.major_problems,
            voting_intention_ls_party: rec.voting_intention_ls_party,
            ls_past_party: rec.ls_past_party,
            ls_past_candidate: rec.ls_past_candidate
          }),
          geography_data: JSON.stringify({ state: 'BR', ac: rec.ac_name, ac_num: rec.ac_num }),
          source_status: 'COMPLETED',
          capi_status: 'COMPLETED',
          super_audit_status: 'PENDING',
          tvc_status: 'PENDING',
          fa_status: 'PENDING',
          priority: 85,
          risk_score: 25.0,
          audio_link: rec.audio_link,
          duration: parseFloat(rec.duration) || 3.5,
          created_at: new Date(rec.submission_date || Date.now()),
          updated_at: new Date()
        });
      }

      if (!store.capi_audits.some(c => c.id === capiId)) {
        store.capi_audits.push({
          id: capiId,
          submission_id: subId,
          project_id: PROJECT_1_ID,
          vendor_id: VENDOR_1_ID,
          auditor_id: USER_CAPI_ID,
          audit_type: 'AUDIO_FIRST',
          status: 'COMPLETED',
          audio_url: rec.audio_link,
          audio_duration: Math.round((parseFloat(rec.duration) || 3.5) * 60),
          audio_quality_score: 92.0,
          audio_status: 'PRESENT',
          gps_lat: 25.3176,
          gps_lng: 82.9739,
          gps_accuracy: 5.0,
          gps_status: 'MATCH',
          score: 85.0,
          decision: 'PASS',
          feedback: 'CAPI Field Audit Verified',
          flags: JSON.stringify([]),
          started_at: new Date(),
          completed_at: new Date(),
          duration_seconds: 400,
          created_at: new Date(),
          updated_at: new Date()
        });
      }

      if (!store.super_audits.some(s => s.id === saId)) {
        store.super_audits.push({
          id: saId,
          submission_id: subId,
          project_id: PROJECT_1_ID,
          vendor_id: VENDOR_1_ID,
          capi_audit_id: capiId,
          super_auditor_id: USER_SUPER_ID,
          routing_reason: 'CLIENT_DB_SUPER_AUDIT',
          status: 'PENDING',
          decision: null,
          original_decision: 'PASS',
          final_decision: null,
          capi_score: 85.0,
          super_audit_score: null,
          variance_score: 0.0,
          notes: null,
          metadata: JSON.stringify(rec),
          created_at: new Date(),
          updated_at: new Date(),
          business_submission_id: rec.submission_id,
          respondent_name: rec.full_name,
          respondent_phone: rec.phone_no,
          project_name: 'Bihar Pre-Poll AC Survey',
          project_code: 'BH-AC-R3',
          vendor_name: rec.vendor_name || 'Field Agency',
          vendor_code: rec.vendor_code || 'VND',
          audio_link: rec.audio_link,
          ac_name: rec.ac_name,
          ac_num: rec.ac_num,
          duration: rec.duration
        });
      }
    });
  }
} catch (e) {
  console.warn('Could not load client_5_audit_records.json:', e.message);
}

// ============================================================================
// GENERIC QUERY & MUTATION HELPERS
// ============================================================================

/**
 * Filter an array of items using a plain object filter dictionary.
 */
function applyFilters(items, filters = {}) {
  return items.filter((item) => {
    for (const [key, val] of Object.entries(filters)) {
      if (val === undefined || val === null || val === '') continue;

      // Special string search handling
      if (key === 'search') {
        const term = String(val).toLowerCase();
        const searchableValues = Object.values(item).map((v) => (typeof v === 'string' ? v.toLowerCase() : ''));
        const matches = searchableValues.some((v) => v.includes(term));
        if (!matches) return false;
        continue;
      }

      // Date range filtering
      if (key === 'dateFrom' && item.created_at) {
        if (new Date(item.created_at) < new Date(val)) return false;
        continue;
      }
      if (key === 'dateTo' && item.created_at) {
        if (new Date(item.created_at) > new Date(val)) return false;
        continue;
      }

      // Match item properties (handling snake_case / camelCase)
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      const itemVal = item[key] !== undefined ? item[key] : item[snakeKey];

      if (itemVal !== undefined) {
        if (typeof itemVal === 'string' && typeof val === 'string') {
          if (itemVal.toLowerCase() !== val.toLowerCase()) return false;
        } else if (itemVal != val) {
          return false;
        }
      }
    }
    return true;
  });
}

/**
 * Apply sorting and pagination to a list of items.
 */
function applyPagination(items, pagination = {}) {
  const { limit = 20, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
  const sorted = [...items].sort((a, b) => {
    const valA = a[sortBy] || a.created_at || 0;
    const valB = b[sortBy] || b.created_at || 0;
    if (valA < valB) return sortOrder.toLowerCase() === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder.toLowerCase() === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted.slice(offset, offset + limit);
}

// ============================================================================
// CORE CRUD API
// ============================================================================

const mockStore = {
  data: store,

  find(collectionName, filters = {}, pagination = {}) {
    const items = store[collectionName] || [];
    const filtered = applyFilters(items, filters);
    return applyPagination(filtered, pagination);
  },

  findOne(collectionName, filter = {}) {
    const items = store[collectionName] || [];
    const filtered = applyFilters(items, filter);
    return filtered.length > 0 ? { ...filtered[0] } : null;
  },

  findById(collectionName, id) {
    const items = store[collectionName] || [];
    const found = items.find((i) => i.id === id || i.submission_id === id || i.code === id || i.call_id === id);
    return found ? { ...found } : null;
  },

  count(collectionName, filters = {}) {
    const items = store[collectionName] || [];
    return applyFilters(items, filters).length;
  },

  insert(collectionName, data) {
    if (!store[collectionName]) {
      store[collectionName] = [];
    }
    const record = {
      id: data.id || uuidv4(),
      ...data,
      created_at: data.created_at || new Date(),
      updated_at: new Date(),
    };
    store[collectionName].unshift(record);
    return { ...record };
  },

  update(collectionName, id, updates) {
    const items = store[collectionName] || [];
    const index = items.findIndex((i) => i.id === id || i.submission_id === id || i.call_id === id);
    if (index === -1) {
      return null;
    }
    items[index] = {
      ...items[index],
      ...updates,
      updated_at: new Date(),
    };
    return { ...items[index] };
  },

  updateById(collectionName, id, updates) {
    return this.update(collectionName, id, updates);
  },

  delete(collectionName, id) {
    const items = store[collectionName] || [];
    const initialLen = items.length;
    store[collectionName] = items.filter((i) => i.id !== id && i.submission_id !== id);
    return initialLen - store[collectionName].length;
  },

  deleteById(collectionName, id) {
    return this.delete(collectionName, id);
  },

  // ==========================================================================
  // DOMAIN-SPECIFIC MOCK METHODS
  // ==========================================================================

  // Users & Auth
  findUserByEmail(email) {
    const user = store.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return null;
    const role = store.roles.find((r) => r.id === user.role_id) || {};
    const vendor = store.vendors.find((v) => v.id === user.vendor_id) || {};
    return {
      ...user,
      role_name: role.name,
      role_display_name: role.display_name,
      role_permissions: role.permissions,
      vendor_name: vendor.name,
      vendor_code: vendor.code,
    };
  },

  findUserById(id) {
    const user = store.users.find((u) => u.id === id);
    if (!user) return null;
    const role = store.roles.find((r) => r.id === user.role_id) || {};
    const vendor = store.vendors.find((v) => v.id === user.vendor_id) || {};
    const campaigns = this.getUserCampaignAssignments(user.id);
    const documents = this.getUserDocuments(user.id);
    return {
      ...user,
      role_name: role.name,
      role_slug: role.slug,
      role_display_name: role.display_name,
      role_permissions: role.permissions,
      vendor_name: vendor.name,
      vendor_code: vendor.code,
      campaigns: campaigns.length > 0 ? campaigns.map(c => ({
        id: c.id,
        campaignId: c.campaign_id,
        campaignName: c.campaign_name,
        roleSlug: c.role_slug,
        roleName: c.role_name,
      })) : [],
      documents: documents.length > 0 ? documents.map(d => ({
        type: d.document_type,
        name: d.document_name,
        verified: d.status === 'VERIFIED',
      })) : [
        { type: 'IDENTITY_PROOF', name: 'ID_Verified.pdf', verified: true },
        { type: 'VENDOR_AUTHORIZATION', name: 'Auth_Letter.pdf', verified: true },
        { type: 'NDA_CONFIDENTIALITY', name: 'NDA_Signed.pdf', verified: true },
        { type: 'TRAINING_CERTIFICATE', name: 'Training_Pass.pdf', verified: true },
        { type: 'DATA_PRIVACY_POLICY', name: 'Policy_Accepted.pdf', verified: true },
      ],
    };
  },

  getUsersList(filters = {}, pagination = {}) {
    const items = applyFilters(store.users, filters).map((u) => {
      const role = store.roles.find((r) => r.id === u.role_id) || {};
      const vendor = store.vendors.find((v) => v.id === u.vendor_id) || {};
      const campaigns = this.getUserCampaignAssignments(u.id);
      const documents = this.getUserDocuments(u.id);
      return {
        ...u,
        role_name: role.name,
        role_slug: role.slug,
        role_display_name: role.display_name,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        campaigns: campaigns.length > 0 ? campaigns.map(c => ({
          id: c.id,
          campaignId: c.campaign_id,
          campaignName: c.campaign_name,
          roleSlug: c.role_slug,
          roleName: c.role_name,
        })) : [],
        documents: documents.length > 0 ? documents.map(d => ({
          type: d.document_type,
          name: d.document_name,
          verified: d.status === 'VERIFIED',
        })) : [
          { type: 'IDENTITY_PROOF', name: 'ID_Verified.pdf', verified: true },
          { type: 'VENDOR_AUTHORIZATION', name: 'Auth_Letter.pdf', verified: true },
          { type: 'NDA_CONFIDENTIALITY', name: 'NDA_Signed.pdf', verified: true },
          { type: 'TRAINING_CERTIFICATE', name: 'Training_Pass.pdf', verified: true },
          { type: 'DATA_PRIVACY_POLICY', name: 'Policy_Accepted.pdf', verified: true },
        ],
      };
    });
    return applyPagination(items, pagination);
  },

  // Submissions with joined relations
  getSubmissionsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.submissions, filters).map((sub) => {
      const project = store.projects.find((p) => p.id === sub.project_id) || {};
      const vendor = store.vendors.find((v) => v.id === sub.vendor_id) || {};
      const agent = store.users.find((u) => u.id === sub.source_agent_id) || {};
      const qv = store.questionnaire_versions.find((q) => q.id === sub.questionnaire_version_id) || {};
      return {
        ...sub,
        project_name: project.name,
        project_code: project.project_code,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        agent_email: agent.email,
        agent_first_name: agent.first_name,
        agent_last_name: agent.last_name,
        questionnaire_name: qv.name,
        questionnaire_version_number: qv.version_number,
      };
    });
    return applyPagination(items, pagination);
  },

  getSubmissionById(id) {
    const sub = store.submissions.find((s) => s.id === id || s.submission_id === id);
    if (!sub) return null;
    const project = store.projects.find((p) => p.id === sub.project_id) || {};
    const vendor = store.vendors.find((v) => v.id === sub.vendor_id) || {};
    const agent = store.users.find((u) => u.id === sub.source_agent_id) || {};
    const qv = store.questionnaire_versions.find((q) => q.id === sub.questionnaire_version_id) || {};
    return {
      ...sub,
      project_name: project.name,
      project_code: project.project_code,
      vendor_name: vendor.name,
      vendor_code: vendor.code,
      agent_email: agent.email,
      agent_first_name: agent.first_name,
      agent_last_name: agent.last_name,
      questionnaire_name: qv.name,
      questionnaire_version_number: qv.version_number,
    };
  },

  // CAPI Audits with joined relations
  getCapiAuditsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.capi_audits, filters).map((audit) => {
      const sub = store.submissions.find((s) => s.id === audit.submission_id) || {};
      const project = store.projects.find((p) => p.id === audit.project_id) || {};
      const vendor = store.vendors.find((v) => v.id === audit.vendor_id) || {};
      const auditor = store.users.find((u) => u.id === audit.auditor_id) || {};
      const fieldAgent = store.users.find((u) => u.id === sub.source_agent_id) || {};
      return {
        ...audit,
        business_submission_id: sub.submission_id,
        respondent_name: sub.respondent_name,
        respondent_phone: sub.respondent_phone,
        source_channel: sub.source_channel,
        project_name: project.name,
        project_code: project.project_code,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        auditor_first_name: auditor.first_name,
        auditor_last_name: auditor.last_name,
        auditor_email: auditor.email,
        field_agent_first_name: fieldAgent.first_name,
        field_agent_last_name: fieldAgent.last_name,
      };
    });
    return applyPagination(items, pagination);
  },

  getCapiAuditById(id) {
    const audit = store.capi_audits.find((a) => a.id === id);
    if (!audit) return null;
    const sub = store.submissions.find((s) => s.id === audit.submission_id) || {};
    const project = store.projects.find((p) => p.id === audit.project_id) || {};
    const vendor = store.vendors.find((v) => v.id === audit.vendor_id) || {};
    const auditor = store.users.find((u) => u.id === audit.auditor_id) || {};
    return {
      ...audit,
      business_submission_id: sub.submission_id,
      respondent_name: sub.respondent_name,
      respondent_phone: sub.respondent_phone,
      source_channel: sub.source_channel,
      project_name: project.name,
      project_code: project.project_code,
      vendor_name: vendor.name,
      vendor_code: vendor.code,
      auditor_first_name: auditor.first_name,
      auditor_last_name: auditor.last_name,
      auditor_email: auditor.email,
    };
  },

  // Super Audits with joined relations
  getSuperAuditsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.super_audits, filters).map((sa) => {
      const sub = store.submissions.find((s) => s.id === sa.submission_id) || {};
      const project = store.projects.find((p) => p.id === sa.project_id) || {};
      const vendor = store.vendors.find((v) => v.id === sa.vendor_id) || {};
      const superAuditor = store.users.find((u) => u.id === sa.super_auditor_id) || {};
      const capiAudit = store.capi_audits.find((c) => c.id === sa.capi_audit_id) || {};
      return {
        ...sa,
        business_submission_id: sub.submission_id,
        respondent_name: sub.respondent_name,
        respondent_phone: sub.respondent_phone,
        project_name: project.name,
        project_code: project.project_code,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        super_auditor_first_name: superAuditor.first_name,
        super_auditor_last_name: superAuditor.last_name,
        super_auditor_email: superAuditor.email,
        capi_decision: capiAudit.decision,
      };
    });
    return applyPagination(items, pagination);
  },

  getSuperAuditById(id) {
    const sa = store.super_audits.find((a) => a.id === id);
    if (!sa) return null;
    const sub = store.submissions.find((s) => s.id === sa.submission_id) || {};
    const project = store.projects.find((p) => p.id === sa.project_id) || {};
    const vendor = store.vendors.find((v) => v.id === sa.vendor_id) || {};
    const superAuditor = store.users.find((u) => u.id === sa.super_auditor_id) || {};
    return {
      ...sa,
      business_submission_id: sub.submission_id,
      respondent_name: sub.respondent_name,
      respondent_phone: sub.respondent_phone,
      project_name: project.name,
      project_code: project.project_code,
      vendor_name: vendor.name,
      vendor_code: vendor.code,
      super_auditor_first_name: superAuditor.first_name,
      super_auditor_last_name: superAuditor.last_name,
      super_auditor_email: superAuditor.email,
    };
  },

  // TVC Leads with joined relations
  getTvcLeadsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.tvc_leads, filters).map((lead) => {
      const sub = store.submissions.find((s) => s.id === lead.submission_id) || {};
      const project = store.projects.find((p) => p.id === lead.project_id) || {};
      const vendor = store.vendors.find((v) => v.id === lead.vendor_id) || {};
      const agent = store.users.find((u) => u.id === lead.agent_id) || {};
      return {
        ...lead,
        business_submission_id: sub.submission_id,
        project_name: project.name,
        project_code: project.project_code,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        agent_first_name: agent.first_name,
        agent_last_name: agent.last_name,
        agent_email: agent.email,
      };
    });
    return applyPagination(items, pagination);
  },

  // Feedback Leads with joined relations
  getFeedbackLeadsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.feedback_leads, filters).map((lead) => {
      const sub = store.submissions.find((s) => s.id === lead.submission_id) || {};
      const project = store.projects.find((p) => p.id === lead.project_id) || {};
      const vendor = store.vendors.find((v) => v.id === lead.vendor_id) || {};
      const fieldAgent = store.users.find((u) => u.id === lead.field_agent_id) || {};
      const caller = store.users.find((u) => u.id === lead.feedback_caller_id) || {};
      return {
        ...lead,
        business_submission_id: sub.submission_id,
        project_name: project.name,
        project_code: project.project_code,
        vendor_name: vendor.name,
        vendor_code: vendor.code,
        field_agent_first_name: fieldAgent.first_name,
        field_agent_last_name: fieldAgent.last_name,
        field_agent_email: fieldAgent.email,
        caller_first_name: caller.first_name,
        caller_last_name: caller.last_name,
      };
    });
    return applyPagination(items, pagination);
  },

  // Dialer CDR list with relations
  getDialerCdrsList(filters = {}, pagination = {}) {
    const items = applyFilters(store.dialer_cdr, filters).map((cdr) => {
      const project = store.projects.find((p) => p.id === cdr.project_id) || {};
      const agent = store.users.find((u) => u.id === cdr.agent_id) || {};
      return {
        ...cdr,
        project_name: project.name,
        agent_first_name: agent.first_name,
        agent_last_name: agent.last_name,
      };
    });
    return applyPagination(items, pagination);
  },

  // ==========================================================================
  // ANALYTICAL REPORT MOCKS
  // ==========================================================================

  getReportCatiSummary() {
    return {
      total_submissions: 0,
      completed_interviews: 0,
      started_interviews: 0,
      in_progress_interviews: 0,
      failed_interviews: 0,
      unique_agents: 0,
      unique_vendors: 0,
      avg_duration_seconds: 0,
      min_duration_seconds: 0,
      max_duration_seconds: 0,
      avg_risk_score: 0,
    };
  },

  getReportCatiTimeSeries(interval = 'day') {
    return [];
  },

  getReportCatiTable(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportCatiApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportCapiSummary() {
    return {
      total_audits: 0,
      passed_audits: 0,
      failed_audits: 0,
      pending_audits: 0,
      audio_first_count: 0,
      full_audit_count: 0,
      avg_quality_score: 0,
      avg_audit_duration_seconds: 0,
      unique_auditors: 0,
      pass_rate: 0,
    };
  },

  getReportCapiTable(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportCapiApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportSuperAuditSummary() {
    return {
      total_super_audits: 0,
      agreed_count: 0,
      overruled_count: 0,
      pending_count: 0,
      concordance_rate: 0,
      avg_variance_score: 0,
      avg_super_audit_score: 0,
      unique_super_auditors: 0,
    };
  },

  getReportSuperAuditApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportTvcSummary() {
    return {
      total_leads: 0,
      verified_leads: 0,
      failed_leads: 0,
      pending_leads: 0,
      total_attempts: 0,
      verification_rate: 0,
      avg_attempts_per_lead: 0,
      avg_call_duration_seconds: 0,
    };
  },

  getReportTvcTable(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportTvcApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportFaSummary() {
    return {
      total_leads: 0,
      resolved_leads: 0,
      pending_leads: 0,
      mistake_admitted_count: 0,
      re_training_assigned: 0,
      resolution_rate: 0,
      avg_call_duration_seconds: 0,
    };
  },

  getReportFaApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  getReportUnifiedApr(pagination = {}) {
    return {
      rows: [],
      total: 0,
    };
  },

  // Multi-Tenant Licensing, Concurrent Seat Lease Engine & Multi-Campaign Assignment Helpers
  cleanExpiredLeases() {
    const now = new Date();
    store.active_seat_leases = store.active_seat_leases.filter((l) => new Date(l.expires_at) > now);
  },

  reserveSeatLease(organizationId, userId, metadata = {}) {
    this.cleanExpiredLeases();

    // Check if user already holds an active lease (same session / multi-tab re-use)
    const existing = store.active_seat_leases.find((l) => l.user_id === userId);
    if (existing) {
      existing.updated_at = new Date();
      existing.expires_at = new Date(Date.now() + 8 * 3600 * 1000);
      return existing;
    }

    const org = store.organizations.find((o) => o.id === organizationId) || store.organizations[0];
    const maxSeats = org?.max_concurrent_human_seats || 5;
    const activeOrgLeases = store.active_seat_leases.filter((l) => l.organization_id === organizationId);

    if (activeOrgLeases.length >= maxSeats) {
      const err = new Error(
        `LICENSE_LIMIT_EXCEEDED: All ${maxSeats} concurrent human seats are currently in use by your organization. Please wait for an active agent to log out or upgrade your license.`
      );
      err.code = 'LICENSE_LIMIT_EXCEEDED';
      err.statusCode = 403;
      throw err;
    }

    const lease = {
      id: uuidv4(),
      organization_id: organizationId,
      user_id: userId,
      session_id: uuidv4(),
      ip_address: metadata.ip || '127.0.0.1',
      user_agent: metadata.userAgent || 'Browser',
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + 8 * 3600 * 1000),
    };
    store.active_seat_leases.push(lease);
    return lease;
  },

  releaseSeatLease(userId) {
    store.active_seat_leases = store.active_seat_leases.filter((l) => l.user_id !== userId);
    return true;
  },

  getOrganizationLeaseStats(organizationId) {
    this.cleanExpiredLeases();
    const org = store.organizations.find((o) => o.id === organizationId) || store.organizations[0];
    const maxSeats = org?.max_concurrent_human_seats || 5;
    const leases = store.active_seat_leases.filter((l) => l.organization_id === organizationId);
    return {
      maxSeats,
      activeCount: leases.length,
      remainingSeats: Math.max(0, maxSeats - leases.length),
      leases,
    };
  },

  getUserCampaignAssignments(userId) {
    const assignments = store.user_campaign_assignments.filter((a) => a.user_id === userId);
    return assignments.map((a) => {
      const campaign = store.projects.find((p) => p.id === a.campaign_id) || {};
      const role = store.roles.find((r) => r.id === a.role_id) || {};
      const vendor = store.vendors.find((v) => v.id === a.vendor_id) || {};
      return {
        ...a,
        campaign_name: campaign.name || 'General Survey Campaign',
        campaign_code: campaign.project_code || 'CAM-01',
        role_name: role.name || a.role_slug,
        role_slug: a.role_slug || role.slug || 'CATI_AGENT',
        vendor_name: vendor.name || 'Direct / Internal',
      };
    });
  },

  createUserCampaignAssignment(data) {
    const newAsg = {
      id: data.id || `asg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: data.userId || data.user_id,
      organization_id: data.organizationId || data.organization_id,
      vendor_id: data.vendorId || data.vendor_id || null,
      campaign_id: data.campaignId || data.campaign_id,
      role_id: data.roleId || data.role_id,
      role_slug: data.roleSlug || data.role_slug || 'CATI_AGENT',
      team_id: data.teamId || data.team_id || null,
      start_date: data.startDate || data.start_date || new Date().toISOString().split('T')[0],
      end_date: data.endDate || data.end_date || '2026-12-31',
      status: data.status || 'ACTIVE',
      assigned_by: data.assignedBy || data.assigned_by || null,
      module_setup: data.moduleSetup || data.module_setup || {},
      created_at: new Date(),
    };
    store.user_campaign_assignments.push(newAsg);
    return newAsg;
  },

  deleteUserCampaignAssignment(assignmentId) {
    const idx = store.user_campaign_assignments.findIndex((a) => a.id === assignmentId);
    if (idx !== -1) {
      store.user_campaign_assignments.splice(idx, 1);
      return true;
    }
    return false;
  },

  getUserDocuments(userId) {
    return store.user_documents.filter((d) => d.user_id === userId);
  },

  addUserDocument(data) {
    const doc = {
      id: data.id || `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: data.userId || data.user_id,
      document_type: data.documentType || data.document_type,
      document_name: data.documentName || data.document_name,
      status: data.status || 'PENDING',
      verified_by: data.verifiedBy || data.verified_by || null,
      verified_at: data.status === 'VERIFIED' ? new Date() : null,
      created_at: new Date(),
    };
    store.user_documents.push(doc);
    return doc;
  },

  verifyUserDocument(docId, status, verifiedBy) {
    const doc = store.user_documents.find((d) => d.id === docId);
    if (doc) {
      doc.status = status;
      doc.verified_by = verifiedBy;
      doc.verified_at = new Date();
      return doc;
    }
    return null;
  },

  getOrganizationQuotaStats(organizationId) {
    this.cleanExpiredLeases();
    const org = store.organizations.find((o) => o.id === organizationId) || store.organizations[0];
    const totalUsers = store.users.filter((u) => u.organization_id === organizationId && !u.deleted_at).length;
    const leases = store.active_seat_leases.filter(
      (l) => l.organization_id === organizationId && new Date(l.expires_at) > new Date()
    );
    return {
      organizationId,
      organizationName: org?.name || 'Stelleronix Organization',
      maxCreatedUsers: org?.max_created_users || 200,
      currentCreatedUsers: totalUsers,
      maxConcurrentHumanSeats: org?.max_concurrent_human_seats || 5,
      activeConcurrentHumanSeats: leases.length,
      auditAiLicenses: org?.audit_ai_licenses || 2,
      voiceAiLicenses: org?.voice_ai_licenses || 1,
      enabledModules: org?.enabled_modules || [
        'field_cati',
        'remote_cati',
        'capi_audit',
        'super_audit',
        'tvc',
        'fa',
        'exam',
        'dialer',
      ],
      licenseStatus: org?.license_status || 'ACTIVE',
      validityStart: org?.license_validity_start || '2026-01-01',
      validityEnd: org?.license_validity_end || '2027-01-01',
    };
  },

  // ==========================================================================
  // MULTI-VENDOR ALLOCATION & STRICT DATA ISOLATION
  // ==========================================================================

  /**
   * Allocate 100% of campaign leads to a single specific vendor.
   */
  allocateCampaignLeadsSingle(projectId, vendorId, options = {}) {
    const { reallocateAll = false } = options;
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Campaign '${projectId}' not found`);

    const vendor = store.vendors.find((v) => v.id === vendorId);
    if (!vendor) throw new Error(`Vendor '${vendorId}' not found`);

    let candidateLeads = store.campaign_leads.filter((l) => l.project_id === projectId);
    if (!reallocateAll) {
      const unassigned = candidateLeads.filter((l) => !l.vendor_id);
      candidateLeads = unassigned.length > 0 ? unassigned : candidateLeads;
    }

    const totalLeads = candidateLeads.length;

    candidateLeads.forEach((lead) => {
      lead.vendor_id = vendor.id;
      lead.status = 'ASSIGNED';
      lead.allocated_at = new Date();
      lead.updated_at = new Date();
    });

    let asg = store.project_vendor_assignments.find(
      (a) => a.project_id === projectId && a.vendor_id === vendor.id
    );
    if (!asg) {
      asg = {
        id: uuidv4(),
        project_id: projectId,
        vendor_id: vendor.id,
        quota: JSON.stringify({ target: totalLeads, mode: 'SINGLE_100_PERCENT' }),
        allocated_leads_count: totalLeads,
        is_active: true,
        created_at: new Date(),
      };
      store.project_vendor_assignments.push(asg);
    } else {
      asg.allocated_leads_count = totalLeads;
      asg.quota = JSON.stringify({ target: totalLeads, mode: 'SINGLE_100_PERCENT' });
      asg.is_active = true;
    }

    if (reallocateAll) {
      store.project_vendor_assignments
        .filter((a) => a.project_id === projectId && a.vendor_id !== vendor.id)
        .forEach((a) => { a.is_active = false; });
    }

    project.distribution_method = 'SINGLE';
    project.assigned_single_vendor_id = vendor.id;

    return {
      projectId,
      totalLeads,
      vendorCount: 1,
      method: 'SINGLE',
      perVendorCount: totalLeads,
      remainderCount: 0,
      pendingPoolCount: store.campaign_leads.filter((l) => l.project_id === projectId && !l.vendor_id).length,
      allocatedVendors: [
        {
          vendorId: vendor.id,
          vendorName: vendor.name,
          vendorCode: vendor.code,
          allocatedCount: totalLeads,
          percentage: 100,
        },
      ],
      allocatedAt: new Date().toISOString(),
      message: `100% of campaign leads (${totalLeads}) assigned to single vendor '${vendor.name}'.`,
    };
  },

  /**
   * Split campaign leads evenly among selected vendors (e.g. 65 leads across 5 vendors -> 13 per vendor).
   * Remainder leads remain in campaign pending pool for automatic reassignment.
   */
  allocateCampaignLeads(projectId, vendorIds = [], options = {}) {
    if (options.method === 'SINGLE' || options.method === 'SINGLE_VENDOR' || (options.vendorId && (!vendorIds || vendorIds.length <= 1))) {
      const vId = options.vendorId || (vendorIds && vendorIds[0]);
      return this.allocateCampaignLeadsSingle(projectId, vId, options);
    }
    const { reallocateAll = false } = options;
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new Error(`Campaign '${projectId}' not found`);

    let targetVendors = [];
    if (vendorIds && vendorIds.length > 0) {
      targetVendors = store.vendors.filter((v) => vendorIds.includes(v.id));
    } else {
      const asgs = store.project_vendor_assignments.filter((a) => a.project_id === projectId && a.is_active);
      const asgVendorIds = asgs.map((a) => a.vendor_id);
      targetVendors = store.vendors.filter((v) => asgVendorIds.includes(v.id));
      if (targetVendors.length === 0) {
        targetVendors = store.vendors.slice(0, 5);
      }
    }

    if (targetVendors.length === 0) {
      throw new Error('At least one vendor must be selected for campaign lead allocation.');
    }

    let candidateLeads = store.campaign_leads.filter((l) => l.project_id === projectId);
    if (!reallocateAll) {
      const unassigned = candidateLeads.filter((l) => !l.vendor_id);
      candidateLeads = unassigned.length > 0 ? unassigned : candidateLeads;
    }

    const totalLeads = candidateLeads.length;
    const vendorCount = targetVendors.length;
    const perVendorCount = Math.floor(totalLeads / vendorCount);
    const remainderCount = totalLeads % vendorCount;

    const allocationSummary = [];

    targetVendors.forEach((vendor, index) => {
      const startIdx = index * perVendorCount;
      const endIdx = startIdx + perVendorCount;
      const vendorLeads = candidateLeads.slice(startIdx, endIdx);

      vendorLeads.forEach((lead) => {
        lead.vendor_id = vendor.id;
        lead.status = 'ASSIGNED';
        lead.allocated_at = new Date();
        lead.updated_at = new Date();
      });

      let asg = store.project_vendor_assignments.find(
        (a) => a.project_id === projectId && a.vendor_id === vendor.id
      );
      if (!asg) {
        asg = {
          id: uuidv4(),
          project_id: projectId,
          vendor_id: vendor.id,
          allocated_states: JSON.stringify(['UP', 'MH', 'BR']),
          allocated_modules: JSON.stringify(['CATI', 'CAPI', 'SUPER_AUDIT', 'TVC']),
          quota: JSON.stringify({ target: perVendorCount }),
          allocated_leads_count: perVendorCount,
          is_active: true,
          created_at: new Date(),
        };
        store.project_vendor_assignments.push(asg);
      } else {
        asg.allocated_leads_count = perVendorCount;
        asg.quota = JSON.stringify({ target: perVendorCount });
        asg.is_active = true;
      }

      allocationSummary.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        vendorCode: vendor.code,
        allocatedCount: vendorLeads.length,
      });
    });

    const remainderLeads = candidateLeads.slice(vendorCount * perVendorCount);
    if (options.distributeRemainder && remainderLeads.length > 0) {
      remainderLeads.forEach((lead, r) => {
        const targetVendor = targetVendors[r % vendorCount];
        lead.vendor_id = targetVendor.id;
        lead.status = 'ASSIGNED';
        lead.allocated_at = new Date();
        lead.updated_at = new Date();
        const vSummary = allocationSummary.find((s) => s.vendorId === targetVendor.id);
        if (vSummary) vSummary.allocatedCount += 1;
      });
    } else {
      remainderLeads.forEach((lead) => {
        lead.vendor_id = null;
        lead.status = 'PENDING';
        lead.allocated_at = null;
        lead.updated_at = new Date();
      });
    }

    return {
      projectId,
      totalLeads,
      vendorCount,
      perVendorCount,
      remainderCount: options.distributeRemainder ? 0 : remainderCount,
      pendingPoolCount: store.campaign_leads.filter((l) => l.project_id === projectId && !l.vendor_id).length,
      allocatedVendors: allocationSummary,
      allocatedAt: new Date().toISOString(),
    };
  },

  /**
   * Alias for allocateCampaignLeads to support allocateLeadsEqualSplit.
   */
  allocateLeadsEqualSplit(projectId, vendorIds = [], options = {}) {
    return this.allocateCampaignLeads(projectId, vendorIds, options);
  },

  /**
   * Auto-assign any remaining leads in the campaign pending pool across active vendors.
   */
  autoAssignPendingLeads(projectId) {
    const pendingLeads = store.campaign_leads.filter((l) => l.project_id === projectId && !l.vendor_id);
    if (pendingLeads.length === 0) {
      return {
        projectId,
        assignedCount: 0,
        remainderCount: 0,
        message: 'No pending leads in campaign pool to reassign.',
      };
    }

    const asgs = store.project_vendor_assignments.filter((a) => a.project_id === projectId && a.is_active);
    const activeVendors = store.vendors.filter((v) => asgs.some((a) => a.vendor_id === v.id));
    const vendorsToUse = activeVendors.length > 0 ? activeVendors : store.vendors.slice(0, 5);

    if (vendorsToUse.length === 0) {
      throw new Error('No active vendors available to receive pending leads.');
    }

    pendingLeads.forEach((lead, idx) => {
      const assignedVendor = vendorsToUse[idx % vendorsToUse.length];
      lead.vendor_id = assignedVendor.id;
      lead.status = 'ASSIGNED';
      lead.allocated_at = new Date();
      lead.updated_at = new Date();
    });

    return {
      projectId,
      assignedCount: pendingLeads.length,
      remainderCount: 0,
      activeVendorsCount: vendorsToUse.length,
      message: `Successfully auto-assigned ${pendingLeads.length} pending lead(s) across ${vendorsToUse.length} vendor agencies.`,
    };
  },

  /**
   * Get campaign leads enforcing strict multi-vendor isolation.
   * Vendor A can NEVER see or access leads belonging to Vendor B.
   */
  getCampaignLeadsIsolated(projectId, filters = {}, userContext = {}) {
    let leads = store.campaign_leads.filter((l) => l.project_id === projectId);

    if (userContext && userContext.vendorId) {
      leads = leads.filter((l) => l.vendor_id === userContext.vendorId);
    } else if (filters.vendorId) {
      leads = leads.filter((l) => l.vendor_id === filters.vendorId);
    }

    if (filters.status) {
      leads = leads.filter((l) => l.status === filters.status);
    }
    if (filters.search) {
      const s = filters.search.toLowerCase();
      leads = leads.filter(
        (l) =>
          (l.respondent_name && l.respondent_name.toLowerCase().includes(s)) ||
          (l.phone_number && l.phone_number.includes(s)) ||
          (l.constituency && l.constituency.toLowerCase().includes(s))
      );
    }

    const allCampaignLeads = store.campaign_leads.filter((l) => l.project_id === projectId);
    const totalCount = allCampaignLeads.length;
    const assignedCount = allCampaignLeads.filter((l) => l.vendor_id).length;
    const pendingCount = allCampaignLeads.filter((l) => !l.vendor_id).length;
    const completedCount = allCampaignLeads.filter((l) => l.status === 'COMPLETED').length;

    const perVendorBreakdown = {};
    store.vendors.forEach((v) => {
      const vLeads = allCampaignLeads.filter((l) => l.vendor_id === v.id);
      if (vLeads.length > 0) {
        perVendorBreakdown[v.id] = {
          vendorId: v.id,
          vendorName: v.name,
          vendorCode: v.code,
          leadCount: vLeads.length,
          completedCount: vLeads.filter((l) => l.status === 'COMPLETED').length,
        };
      }
    });

    return {
      leads: leads.map((l) => {
        const v = store.vendors.find((item) => item.id === l.vendor_id) || {};
        return {
          ...l,
          vendor_name: v.name || 'Unassigned (Pending Pool)',
          vendor_code: v.code || 'PENDING',
        };
      }),
      total: leads.length,
      metrics: {
        totalLeads: totalCount,
        assignedLeads: assignedCount,
        pendingLeads: pendingCount,
        completedLeads: completedCount,
        perVendorBreakdown,
        isVendorScoped: Boolean(userContext && userContext.vendorId),
      },
    };
  },

  /**
   * Conduct survey on a campaign lead with strict vendor isolation check.
   */
  surveyCampaignLead(leadId, userContext = {}, surveyData = {}) {
    const lead = store.campaign_leads.find((l) => l.id === leadId);
    if (!lead) throw new NotFoundError(`Lead '${leadId}' not found`);

    if (userContext && userContext.vendorId && lead.vendor_id && String(lead.vendor_id) !== String(userContext.vendorId)) {
      throw new AuthorizationError('Multi-Vendor Isolation: You are forbidden from accessing or surveying leads allocated to another vendor agency.');
    }

    // Idempotent guard: if lead is already completed, return without repeating operations
    if (lead.status === 'COMPLETED') {
      return lead;
    }

    lead.status = 'COMPLETED';
    lead.audit_status = (surveyData.outputData?.audit_status || 'COMPLETED').toUpperCase();
    lead.locked_by_auditor = null;
    lead.surveyed_at = new Date();
    lead.updated_at = new Date();
    lead.assigned_agent_id = userContext.userId || userContext.id || null;
    lead.metadata = JSON.stringify({
      ...JSON.parse(lead.metadata || '{}'),
      surveyResponses: surveyData.responses || {},
      completedBy: userContext.email || 'agent',
      audit_status: (surveyData.outputData?.audit_status || 'COMPLETED').toUpperCase(),
      locked_by_auditor: null,
    });

    return lead;
  },

  // ==========================================================================
  // CAMPAIGN - QUESTIONNAIRE BINDING
  // ==========================================================================

  /**
   * Bind an existing questionnaire from Question Builder to a campaign.
   * One questionnaire can be bound to multiple campaigns simultaneously.
   */
  bindQuestionnaireToCampaign(projectId, questionnaireId, options = {}) {
    const { module = 'CATI', isPrimary = true } = options;
    const project = store.projects.find((p) => p.id === projectId);
    if (!project) throw new NotFoundError(`Campaign '${projectId}' not found`);

    let qv = store.questionnaire_versions.find((q) => q.id === questionnaireId);
    if (!qv) {
      qv = {
        id: questionnaireId,
        project_id: projectId,
        name: `Questionnaire ${String(questionnaireId).slice(0, 8)}`,
        module: module || 'CATI',
        version_number: 1,
        status: 'PUBLISHED',
      };
      store.questionnaire_versions.push(qv);
    }

    if (isPrimary) {
      project.questionnaire_id = questionnaireId;
      project.updated_at = new Date();
      store.campaign_questionnaires
        .filter((b) => b.project_id === projectId)
        .forEach((b) => {
          b.is_primary = b.questionnaire_id === questionnaireId;
        });
    }

    let binding = store.campaign_questionnaires.find(
      (b) => b.project_id === projectId && b.questionnaire_id === questionnaireId
    );

    if (binding) {
      binding.module = module || qv.module;
      binding.is_primary = isPrimary;
    } else {
      binding = {
        id: `cq-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        project_id: projectId,
        questionnaire_id: questionnaireId,
        module: module || qv.module,
        is_primary: isPrimary,
        bound_at: new Date(),
      };
      store.campaign_questionnaires.push(binding);
    }

    return {
      bindingId: binding.id,
      projectId,
      questionnaireId,
      questionnaireName: qv.name,
      module: binding.module,
      status: qv.status,
      isPrimary,
      boundAt: binding.bound_at,
    };
  },

  /**
   * Unbind a questionnaire from a campaign.
   */
  unbindQuestionnaireFromCampaign(projectId, questionnaireId) {
    const idx = store.campaign_questionnaires.findIndex(
      (b) => b.project_id === projectId && b.questionnaire_id === questionnaireId
    );
    if (idx !== -1) {
      store.campaign_questionnaires.splice(idx, 1);
    }

    const project = store.projects.find((p) => p.id === projectId);
    if (project && project.questionnaire_id === questionnaireId) {
      const remaining = store.campaign_questionnaires.find((b) => b.project_id === projectId);
      project.questionnaire_id = remaining ? remaining.questionnaire_id : null;
    }

    return true;
  },

  /**
   * Get all questionnaires bound to a campaign.
   */
  getCampaignQuestionnaires(projectId) {
    const bindings = store.campaign_questionnaires.filter((b) => b.project_id === projectId);
    const project = store.projects.find((p) => p.id === projectId) || {};

    return bindings.map((b) => {
      const qv = store.questionnaire_versions.find((q) => q.id === b.questionnaire_id) || {};
      const sections = store.sections.filter((s) => s.questionnaire_version_id === qv.id);
      const questions = store.questions.filter((q) => q.questionnaire_version_id === qv.id);
      return {
        ...b,
        questionnaire_name: qv.name,
        version_number: qv.version_number,
        status: qv.status,
        checksum: qv.checksum,
        sections_count: sections.length,
        questions_count: questions.length,
        is_current_active: project.questionnaire_id === b.questionnaire_id,
      };
    });
  },

  /**
   * Get all questionnaire templates available for campaign binding.
   */
  getAvailableQuestionnaires() {
    return store.questionnaire_versions.map((qv) => {
      const boundCampaigns = store.campaign_questionnaires
        .filter((b) => b.questionnaire_id === qv.id)
        .map((b) => {
          const proj = store.projects.find((p) => p.id === b.project_id) || {};
          return {
            projectId: b.project_id,
            projectName: proj.name || 'Campaign',
            projectCode: proj.project_code || proj.code || 'PRJ',
          };
        });

      const sections = store.sections.filter((s) => s.questionnaire_version_id === qv.id);
      const questions = store.questions.filter((q) => q.questionnaire_version_id === qv.id);

      return {
        id: qv.id,
        name: qv.name,
        module: qv.module,
        versionNumber: qv.version_number,
        status: qv.status,
        publishedAt: qv.published_at,
        sectionsCount: sections.length,
        questionsCount: questions.length,
        boundCampaignsCount: boundCampaigns.length,
        boundCampaigns,
      };
    });
  },
};

const proxyHandler = {
  get(target, prop, receiver) {
    if (prop in target) {
      return Reflect.get(target, prop, receiver);
    }
    if (prop === 'voice_fraud_logs') {
      return store.voice_fraud_records || [];
    }
    if (prop in store) {
      return store[prop];
    }
    return undefined;
  },
  set(target, prop, value, receiver) {
    if (prop in target) {
      return Reflect.set(target, prop, value, receiver);
    }
    store[prop] = value;
    return true;
  },
};

const exportStore = new Proxy(mockStore, proxyHandler);
module.exports = exportStore;
