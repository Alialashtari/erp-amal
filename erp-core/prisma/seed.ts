/**
 * Amal ERP Core - Phase 1 seed.
 * Idempotent: safe to run repeatedly.
 * Seeds the permission catalog, system roles, and a bootstrap super admin
 * (from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD) if no users exist.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Permission catalog for Phase 1 modules. Business modules extend this in later phases.
const PERMISSIONS: Array<{ module: string; action: string; description: string }> = [
  { module: 'identity', action: 'manage', description: 'Manage user accounts (create, disable, lock, reset)' },
  { module: 'identity', action: 'view', description: 'View user accounts' },
  { module: 'authorization', action: 'manage', description: 'Manage roles, permissions and assignments' },
  { module: 'authorization', action: 'view', description: 'View roles and permissions' },
  { module: 'audit', action: 'view', description: 'View audit logs' },
  { module: 'audit', action: 'export', description: 'Export audit logs' },
  { module: 'configuration', action: 'manage', description: 'Manage settings and feature flags' },
  { module: 'configuration', action: 'view', description: 'View settings and feature flags' },
  // Phase 2 - crm
  { module: 'crm', action: 'view', description: 'View people list and profiles (sensitive fields masked)' },
  { module: 'crm', action: 'manage', description: 'Create/edit/archive people, contacts, addresses, roles, tags, relationships, identity links' },
  { module: 'crm', action: 'merge', description: 'Merge duplicate person records and reverse merges' },
  { module: 'crm', action: 'export', description: 'Export people data' },
  { module: 'crm', action: 'view_sensitive', description: 'View unmasked national ids, contact values, address lines and GPS' },
  // Phase 2 - storage
  { module: 'storage', action: 'view', description: 'View file metadata, folders and attachments; get download URLs' },
  { module: 'storage', action: 'manage', description: 'Upload files, create folders, archive files, attach files to entities' },
  // Phase 2 - notification
  { module: 'notification', action: 'view', description: 'View notification history and templates' },
  { module: 'notification', action: 'manage', description: 'Manage notification templates' },
  { module: 'notification', action: 'send', description: 'Send notifications through any channel' },
  // Phase 3 - finance
  { module: 'finance', action: 'view', description: 'View transactions, ledger, funds, budgets and financial reports' },
  { module: 'finance', action: 'create', description: 'Record financial transactions and issue receipts' },
  { module: 'finance', action: 'approve', description: 'Approve/reject/reverse transactions (standard tier)' },
  { module: 'finance', action: 'approve_executive', description: 'Approve large transactions (executive tier)' },
  { module: 'finance', action: 'manage_structure', description: 'Manage chart of accounts, funds, cost centers, budgets, approval rules' },
  { module: 'finance', action: 'export', description: 'Export financial data and reports' },
  // Phase 4 - donations
  { module: 'donations', action: 'view', description: 'View campaigns, donations, recurring plans and donor stats' },
  { module: 'donations', action: 'manage', description: 'Create/edit campaigns, lifecycle transitions, campaign updates, recurring status' },
  { module: 'donations', action: 'create', description: 'Record donations, complete pending donations, create recurring plans' },
  { module: 'donations', action: 'refund', description: 'Initiate donation refunds (money moves via finance approval)' },
  { module: 'donations', action: 'export', description: 'Export donation data' },
  // Phase 5A - subscriptions & Baqiyat
  { module: 'subscriptions', action: 'view', description: 'View plans, subscriptions, installments, Baqiyat works and summaries' },
  { module: 'subscriptions', action: 'manage_plans', description: 'Create and edit subscription plans' },
  { module: 'subscriptions', action: 'create', description: 'Enroll subscribers (create subscriptions)' },
  { module: 'subscriptions', action: 'collect', description: 'Record installment payments' },
  { module: 'subscriptions', action: 'manage', description: 'Pause/cancel subscriptions, waive installments, manage Baqiyat works' },
  { module: 'subscriptions', action: 'export', description: 'Export subscription data' },
  // Phase 6 - workflow engine
  { module: 'workflow', action: 'view', description: 'View workflow definitions and instances' },
  { module: 'workflow', action: 'manage', description: 'Create and edit workflow definitions' },
  // Phase 6 - medical
  { module: 'medical', action: 'view', description: 'View medical cases (scoped) and case files' },
  { module: 'medical', action: 'manage', description: 'Create cases, submit for review, manual transitions' },
  { module: 'medical', action: 'review', description: 'Act on the reception-review workflow step' },
  { module: 'medical', action: 'committee', description: 'Act on the committee-decision workflow step' },
  { module: 'medical', action: 'approve', description: 'Act on the final-approval workflow step' },
  { module: 'medical', action: 'execute', description: 'Record treatments and medical expenses' },
  // Phase 6 - projects
  { module: 'projects', action: 'view', description: 'View programs, projects, certificates' },
  { module: 'projects', action: 'manage', description: 'Create/edit programs, projects, activities, transitions' },
  { module: 'projects', action: 'manage_participants', description: 'Register participants and record attendance' },
  { module: 'projects', action: 'manage_tasks', description: 'Create and progress project tasks' },
  { module: 'projects', action: 'issue_certificates', description: 'Issue certificates' },
  // Phase 6 - volunteers
  { module: 'volunteers', action: 'view', description: 'View volunteer profiles, teams, hours' },
  { module: 'volunteers', action: 'manage', description: 'Create profiles, teams, record hours, evaluations, transitions' },
  { module: 'volunteers', action: 'review', description: 'Act on recruitment review/interview steps' },
  { module: 'volunteers', action: 'approve', description: 'Act on recruitment final approval step' },
  { module: 'volunteers', action: 'approve_hours', description: 'Approve or reject volunteer hours' },
  // Phase 7 - cms
  { module: 'cms', action: 'view', description: 'View CMS content, categories, banners, popups, menus, featured campaigns' },
  { module: 'cms', action: 'manage', description: 'Create/edit content, categories, banners, popups, menus; archive; restore revisions' },
  { module: 'cms', action: 'review', description: 'Approve or return content in review (separation of duties)' },
  { module: 'cms', action: 'publish', description: 'Publish and unpublish approved content' },
  // Phase 7 - communication center
  { module: 'communication', action: 'view', description: 'View communication dashboard, bulk campaigns and announcements' },
  { module: 'communication', action: 'manage', description: 'Create/edit bulk campaigns and announcements' },
  { module: 'communication', action: 'send', description: 'Launch or cancel bulk communication campaigns' },
  // Phase 8 - analytics
  { module: 'analytics', action: 'view', description: 'View executive dashboard, KPIs, trends and periodic reports' },
  { module: 'analytics', action: 'manage', description: 'Trigger KPI snapshot capture manually' },
  { module: 'analytics', action: 'export', description: 'Run custom date-range reports and exports' },
  // Production hardening - monitoring
  { module: 'monitoring', action: 'view', description: 'View queue health, database latency and process metrics' },
];

async function main(): Promise<void> {
  // 1. Permissions
  for (const p of PERMISSIONS) {
    const code = `${p.module}.${p.action}`;
    await prisma.permission.upsert({
      where: { code },
      create: { code, module: p.module, action: p.action, description: p.description },
      update: { description: p.description },
    });
  }

  // 2. System roles
  const superAdmin = await prisma.role.upsert({
    where: { name: 'super_admin' },
    create: { name: 'super_admin', description: 'Full system access', isSystem: true },
    update: {},
  });
  const viewer = await prisma.role.upsert({
    where: { name: 'viewer' },
    create: { name: 'viewer', description: 'Read-only access', isSystem: true },
    update: {},
  });

  const allPermissions = await prisma.permission.findMany();
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id } },
      create: { roleId: superAdmin.id, permissionId: perm.id },
      update: {},
    });
    if (perm.action === 'view') {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: viewer.id, permissionId: perm.id } },
        create: { roleId: viewer.id, permissionId: perm.id },
        update: {},
      });
    }
  }

  // 3. Financial structure seeds (Phase 3): base chart of accounts, general fund,
  //    default cost centers and approval tiers. Idempotent upserts.
  const ACCOUNTS: Array<{ code: string; name: string; nameAr: string; type: string }> = [
    { code: '1000', name: 'Cash', nameAr: 'الصندوق النقدي', type: 'ASSET' },
    { code: '1100', name: 'Bank', nameAr: 'الحساب المصرفي', type: 'ASSET' },
    { code: '1200', name: 'Payment Gateway Clearing', nameAr: 'حساب بوابة الدفع', type: 'ASSET' },
    { code: '4000', name: 'Donations Revenue', nameAr: 'إيرادات التبرعات', type: 'REVENUE' },
    { code: '4100', name: 'Subscriptions Revenue', nameAr: 'إيرادات الاشتراكات', type: 'REVENUE' },
    { code: '4200', name: 'Box Collections Revenue', nameAr: 'إيرادات الصناديق', type: 'REVENUE' },
    { code: '4900', name: 'Other Income', nameAr: 'إيرادات أخرى', type: 'REVENUE' },
    { code: '5000', name: 'Program Expenses', nameAr: 'مصروفات البرامج', type: 'EXPENSE' },
    { code: '5100', name: 'Medical Aid Expenses', nameAr: 'مصروفات المساعدات الطبية', type: 'EXPENSE' },
    { code: '5200', name: 'Administrative Expenses', nameAr: 'المصروفات الإدارية', type: 'EXPENSE' },
    { code: '5300', name: 'Media Expenses', nameAr: 'مصروفات الإعلام', type: 'EXPENSE' },
    { code: '5900', name: 'Other Expenses', nameAr: 'مصروفات أخرى', type: 'EXPENSE' },
  ];
  for (const a of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: a.code },
      create: a as never,
      update: { name: a.name, nameAr: a.nameAr },
    });
  }

  await prisma.fund.upsert({
    where: { code: 'GENERAL' },
    create: { code: 'GENERAL', name: 'General Fund', nameAr: 'الصندوق العام', type: 'GENERAL' },
    update: {},
  });
  await prisma.fund.upsert({
    where: { code: 'BAQIYAT' },
    create: {
      code: 'BAQIYAT',
      name: 'Baqiyat Al-Salihat Fund',
      nameAr: 'صندوق الباقيات الصالحات',
      type: 'RESTRICTED',
    },
    update: {},
  });

  const COST_CENTERS = [
    { code: 'ADMIN', name: 'Administration', nameAr: 'الإدارة العامة' },
    { code: 'MEDIA', name: 'Media', nameAr: 'الإعلام' },
    { code: 'MEDICAL', name: 'Medical', nameAr: 'الطبابة' },
    { code: 'YOUTH', name: 'Youth Programs', nameAr: 'برامج الشباب' },
    { code: 'BOXES', name: 'Collection Boxes', nameAr: 'الصناديق' },
  ];
  for (const c of COST_CENTERS) {
    await prisma.costCenter.upsert({ where: { code: c.code }, create: c, update: { name: c.name } });
  }

  // Approval tiers (FRS-002): expenses >= 10,000,000 IQD need executive approval;
  // everything below the executive tier needs standard finance approval.
  const ruleCount = await prisma.approvalRule.count();
  if (ruleCount === 0) {
    await prisma.approvalRule.createMany({
      data: [
        { transactionType: 'EXPENSE', minAmountIqd: 0, requiredPermission: 'finance.approve', description: 'Standard expense approval' },
        { transactionType: 'EXPENSE', minAmountIqd: 10000000, requiredPermission: 'finance.approve_executive', description: 'Executive approval for large expenses' },
        { transactionType: 'TRANSFER', minAmountIqd: 0, requiredPermission: 'finance.approve', description: 'Fund transfer approval' },
        { transactionType: 'REFUND', minAmountIqd: 0, requiredPermission: 'finance.approve', description: 'Refund approval' },
      ],
    });
  }

  // 3b. Default notification template for donation thanks (Phase 4, optional content)
  await prisma.notificationTemplate.upsert({
    where: { key: 'donation_thanks' },
    create: {
      key: 'donation_thanks',
      channel: 'IN_APP',
      locale: 'ar',
      subject: 'شكراً لتبرعكم',
      body: 'شكراً جزيلاً لتبرعكم بمبلغ {{amount}} دينار عراقي لصالح {{campaign}}. جزاكم الله خيراً.',
      active: true,
    },
    update: {},
  });

  // 3c. Subscription reminder template (Phase 5A)
  await prisma.notificationTemplate.upsert({
    where: { key: 'subscription_reminder' },
    create: {
      key: 'subscription_reminder',
      channel: 'IN_APP',
      locale: 'ar',
      subject: 'تذكير بالاستحقاق',
      body: 'نذكركم باستحقاق قسط اشتراككم رقم {{subscriptionNumber}} بمبلغ {{amount}} دينار عراقي بتاريخ {{dueDate}}.',
      active: true,
    },
    update: {},
  });

  // 3d. Phase 6: MEDICAL restricted fund + seeded workflow definitions (ADR-015)
  await prisma.fund.upsert({
    where: { code: 'MEDICAL' },
    create: {
      code: 'MEDICAL',
      name: 'Medical Aid Fund',
      nameAr: 'صندوق الطبابة',
      type: 'RESTRICTED',
    },
    update: {},
  });

  const WORKFLOWS: Array<{
    key: string;
    name: string;
    module: string;
    entityType: string;
    steps: Array<{ name: string; requiredPermission: string; slaHours?: number }>;
  }> = [
    {
      key: 'medical_case_review',
      name: 'Medical Case Review',
      module: 'medical',
      entityType: 'MedicalCase',
      steps: [
        { name: 'Reception Review', requiredPermission: 'medical.review', slaHours: 72 },
        { name: 'Committee Decision', requiredPermission: 'medical.committee', slaHours: 120 },
        { name: 'Final Approval', requiredPermission: 'medical.approve', slaHours: 72 },
      ],
    },
    {
      key: 'volunteer_application',
      name: 'Volunteer Application',
      module: 'volunteers',
      entityType: 'VolunteerProfile',
      steps: [
        { name: 'Application Review', requiredPermission: 'volunteers.review', slaHours: 120 },
        { name: 'Interview', requiredPermission: 'volunteers.review', slaHours: 168 },
        { name: 'Approval', requiredPermission: 'volunteers.approve', slaHours: 72 },
      ],
    },
  ];
  for (const wf of WORKFLOWS) {
    await prisma.workflowDefinition.upsert({
      where: { key: wf.key },
      create: { key: wf.key, name: wf.name, module: wf.module, entityType: wf.entityType },
      update: { name: wf.name },
    });
    const stepCount = await prisma.workflowStepDef.count({ where: { definitionKey: wf.key } });
    if (stepCount === 0) {
      await prisma.workflowStepDef.createMany({
        data: wf.steps.map((s, i) => ({
          definitionKey: wf.key,
          sequence: i + 1,
          name: s.name,
          requiredPermission: s.requiredPermission,
          slaHours: s.slaHours,
        })),
      });
    }
  }

  // 3e. Phase 7: default content categories and menus (FRS-010)
  const CATEGORIES = [
    { slug: 'news', name: 'News', nameAr: 'أخبار' },
    { slug: 'articles', name: 'Articles', nameAr: 'مقالات' },
    { slug: 'events', name: 'Events', nameAr: 'فعاليات' },
    { slug: 'campaigns', name: 'Campaigns', nameAr: 'حملات' },
    { slug: 'projects', name: 'Projects', nameAr: 'مشاريع' },
    { slug: 'library', name: 'Library', nameAr: 'مكتبة' },
  ];
  for (const c of CATEGORIES) {
    await prisma.contentCategory.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, nameAr: c.nameAr },
    });
  }
  for (const m of [
    { key: 'main', title: 'Main Menu' },
    { key: 'side', title: 'Side Menu' },
    { key: 'footer', title: 'Footer Menu' },
  ]) {
    await prisma.menu.upsert({ where: { key: m.key }, create: m, update: {} });
  }

  // 4. Bootstrap super admin (only when the system has no users at all)
  const userCount = await prisma.user.count();
  if (userCount === 0) {
    const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@amal.local';
    const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!12345';
    const passwordHash = await argon2.hash(password);
    const admin = await prisma.user.create({
      data: { email, passwordHash, status: 'ACTIVE' },
    });
    await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdmin.id } });
    await prisma.auditLog.create({
      data: {
        action: 'CREATE',
        module: 'identity',
        entityType: 'User',
        entityId: admin.id,
        newValue: { email, seeded: true },
      },
    });
    // eslint-disable-next-line no-console
    console.log(`Seeded bootstrap super admin: ${email}`);
  }
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
