/**
 * @file subscription.service.js
 * @description Core business logic for subscriptions, billing plans, pricing, invoices, and receipts.
 */

const { db, withDbFallback } = require('../../database/connection');
const mockStore = require('../../database/mockStore');
const { NotFoundError, ValidationError, AuthorizationError } = require('../../utils/errors');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

// ==========================================
// PRICING CONFIGURATION
// ==========================================

/**
 * Retrieves the current global platform pricing configuration.
 *
 * @returns {Promise<object>}
 */
const getPricingConfig = async () => {
  return withDbFallback(
    async () => {
      let config = await db('subscription_pricing').where('id', 'default').first();
      if (!config) {
        const [inserted] = await db('subscription_pricing')
          .insert({
            id: 'default',
            base_price: 499.00,
            ai_audit_price: 199.00,
            currency: 'USD',
            updated_at: new Date(),
          })
          .returning('*');
        config = inserted;
      }
      return {
        id: config.id,
        basePrice: parseFloat(config.base_price),
        aiAuditPrice: parseFloat(config.ai_audit_price),
        currency: config.currency,
        updatedAt: config.updated_at,
      };
    },
    () => {
      const config = (mockStore.data?.subscription_pricing || [])[0] || {
        id: 'default',
        base_price: 499.00,
        ai_audit_price: 199.00,
        currency: 'USD',
        updated_at: new Date(),
      };
      return {
        id: config.id,
        basePrice: parseFloat(config.base_price),
        aiAuditPrice: parseFloat(config.ai_audit_price),
        currency: config.currency,
        updatedAt: config.updated_at,
      };
    }
  );
};

/**
 * Updates the global platform pricing configuration.
 *
 * @param {object} data
 * @param {number} [data.basePrice]
 * @param {number} [data.aiAuditPrice]
 * @param {string} [data.currency]
 * @returns {Promise<object>}
 */
const updatePricingConfig = async (data = {}) => {
  const current = await getPricingConfig();
  const basePrice = data.basePrice !== undefined ? parseFloat(data.basePrice) : current.basePrice;
  const aiAuditPrice = data.aiAuditPrice !== undefined ? parseFloat(data.aiAuditPrice) : current.aiAuditPrice;
  const currency = data.currency ? data.currency.toUpperCase() : current.currency;

  return withDbFallback(
    async () => {
      const [updated] = await db('subscription_pricing')
        .where('id', 'default')
        .update({
          base_price: basePrice,
          ai_audit_price: aiAuditPrice,
          currency,
          updated_at: new Date(),
        })
        .returning('*');

      return {
        id: updated.id,
        basePrice: parseFloat(updated.base_price),
        aiAuditPrice: parseFloat(updated.ai_audit_price),
        currency: updated.currency,
        updatedAt: updated.updated_at,
      };
    },
    () => {
      const idx = (mockStore.data?.subscription_pricing || []).findIndex((p) => p.id === 'default');
      const updated = {
        id: 'default',
        base_price: basePrice,
        ai_audit_price: aiAuditPrice,
        currency,
        updated_at: new Date(),
      };
      if (idx >= 0) {
        mockStore.data.subscription_pricing[idx] = updated;
      } else {
        mockStore.data.subscription_pricing = [updated];
      }
      return {
        id: updated.id,
        basePrice,
        aiAuditPrice,
        currency,
        updatedAt: updated.updated_at,
      };
    }
  );
};

// ==========================================
// SUBSCRIPTIONS MANAGEMENT
// ==========================================

/**
 * Lists subscriptions with pagination, filtering, and tenant boundaries.
 *
 * @param {object} filters
 * @param {object} pagination
 * @param {object} tenantContext
 * @returns {Promise<{ subscriptions: Array<object>, total: number }>}
 */
const listSubscriptions = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  return withDbFallback(
    async () => {
      let query = db('subscriptions')
        .join('organizations', 'subscriptions.organization_id', 'organizations.id')
        .select(
          'subscriptions.*',
          'organizations.name as organization_name',
          'organizations.slug as organization_slug'
        );

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        query = query.where('subscriptions.organization_id', tenantContext.organizationId);
      } else if (filters.organizationId) {
        query = query.where('subscriptions.organization_id', filters.organizationId);
      }

      if (filters.status) {
        query = query.where('subscriptions.status', filters.status.toUpperCase());
      }

      if (filters.planName) {
        query = query.where('subscriptions.plan_name', filters.planName.toUpperCase());
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((q) => {
          q.whereRaw('LOWER(organizations.name) LIKE ?', [term])
            .orWhereRaw('LOWER(organizations.slug) LIKE ?', [term])
            .orWhereRaw('LOWER(subscriptions.plan_name) LIKE ?', [term]);
        });
      }

      const countQuery = query.clone().clearSelect().count('* as total').first();
      const rowsQuery = query.orderBy('subscriptions.created_at', 'desc').limit(limit).offset(offset);

      const [countResult, rows] = await Promise.all([countQuery, rowsQuery]);
      const total = parseInt(countResult?.total || 0, 10);

      const formatted = rows.map((r) => ({
        id: r.id,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        organizationSlug: r.organization_slug,
        planName: r.plan_name,
        basePrice: parseFloat(r.base_price),
        aiAuditPrice: parseFloat(r.ai_audit_price),
        totalPrice: parseFloat(r.total_price),
        currency: r.currency,
        hasAiAudit: Boolean(r.has_ai_audit),
        billingCycle: r.billing_cycle,
        startDate: r.start_date,
        endDate: r.end_date,
        status: r.status,
        autoRenew: Boolean(r.auto_renew),
        isExpired: new Date(r.end_date) < new Date(),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      return { subscriptions: formatted, total, page, limit };
    },
    () => {
      let items = (mockStore.data?.subscriptions || []).map((s) => {
        const org = (mockStore.data?.organizations || []).find((o) => o.id === s.organization_id) || {};
        return {
          id: s.id,
          organizationId: s.organization_id,
          organizationName: org.name || 'Demo Organization',
          organizationSlug: org.slug || 'demo-org',
          planName: s.plan_name,
          basePrice: parseFloat(s.base_price || 0),
          aiAuditPrice: parseFloat(s.ai_audit_price || 0),
          totalPrice: parseFloat(s.total_price || 0),
          currency: s.currency || 'USD',
          hasAiAudit: Boolean(s.has_ai_audit),
          billingCycle: s.billing_cycle || 'MONTHLY',
          startDate: s.start_date,
          endDate: s.end_date,
          status: s.status,
          autoRenew: Boolean(s.auto_renew),
          isExpired: new Date(s.end_date) < new Date(),
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        };
      });

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        items = items.filter((s) => s.organizationId === tenantContext.organizationId);
      } else if (filters.organizationId) {
        items = items.filter((s) => s.organizationId === filters.organizationId);
      }

      if (filters.status) {
        items = items.filter((s) => s.status === filters.status.toUpperCase());
      }

      return {
        subscriptions: items.slice(offset, offset + limit),
        total: items.length,
        page,
        limit,
      };
    }
  );
};

/**
 * Retrieves the current subscription for a given organization ID.
 *
 * @param {string} organizationId
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getSubscriptionByOrg = async (organizationId, tenantContext = {}) => {
  if (!tenantContext.isMasterAdmin && (!tenantContext.organizationId || String(tenantContext.organizationId) !== String(organizationId))) {
    throw new AuthorizationError('Forbidden: Access denied to organization subscription details.');
  }

  return withDbFallback(
    async () => {
      const org = await db('organizations').where('id', organizationId).first();
      if (!org) {
        throw new NotFoundError(`Organization with ID '${organizationId}' not found.`);
      }

      const activeSub = await db('subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'ACTIVE')
        .where('end_date', '>=', new Date())
        .orderBy('end_date', 'desc')
        .first();

      const latestSub = activeSub || (await db('subscriptions')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .first());

      const invoices = await db('subscription_invoices')
        .where('organization_id', organizationId)
        .orderBy('created_at', 'desc')
        .limit(10);

      const isSubActive = Boolean(latestSub && latestSub.status === 'ACTIVE' && new Date(latestSub.end_date) >= new Date());
      const subStatus = latestSub
        ? (new Date(latestSub.end_date) < new Date() ? 'EXPIRED' : latestSub.status)
        : 'NO_SUBSCRIPTION';

      return {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          code: org.code,
          email: org.email || org.contact_email || 'org@crm.internal',
          phone: org.phone || org.contact_phone || '+880 1700-000000',
          contactPerson: org.contact_person || 'Organization Administrator',
          enableAiAudit: Boolean(org.enable_ai_audit),
        },
        hasActiveSubscription: isSubActive,
        status: subStatus,
        superAdminContact: {
          name: 'Bussiness suite Super Admin',
          email: 'admin@mastercrm.com',
          phone: '+880 1800-000000',
          supportPortal: 'https://support.mastercrm.com',
        },
        subscription: latestSub
          ? {
              id: latestSub.id,
              organizationId: latestSub.organization_id,
              planName: latestSub.plan_name,
              basePrice: parseFloat(latestSub.base_price),
              aiAuditPrice: parseFloat(latestSub.ai_audit_price),
              totalPrice: parseFloat(latestSub.total_price),
              currency: latestSub.currency,
              hasAiAudit: Boolean(latestSub.has_ai_audit),
              billingCycle: latestSub.billing_cycle,
              startDate: latestSub.start_date,
              endDate: latestSub.end_date,
              status: latestSub.status,
              isActive: isSubActive,
              isExpired: new Date(latestSub.end_date) < new Date(),
              autoRenew: Boolean(latestSub.auto_renew),
              createdAt: latestSub.created_at,
              updatedAt: latestSub.updated_at,
            }
          : null,
        recentInvoices: invoices.map((inv) => ({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          receiptNumber: inv.receipt_number,
          totalAmount: parseFloat(inv.total_amount),
          currency: inv.currency,
          paymentStatus: inv.payment_status,
          paidAt: inv.paid_at,
          createdAt: inv.created_at,
        })),
      };
    },
    () => {
      const org = (mockStore.data?.organizations || []).find((o) => o.id === organizationId) || {
        id: organizationId,
        name: 'Demo Org',
        slug: 'demo-org',
        enable_ai_audit: true,
      };

      const subs = (mockStore.data?.subscriptions || []).filter((s) => s.organization_id === organizationId);
      const latestSub = subs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
      const invoices = (mockStore.data?.subscription_invoices || []).filter((i) => i.organization_id === organizationId);

      return {
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          enableAiAudit: Boolean(org.enable_ai_audit),
        },
        subscription: latestSub,
        recentInvoices: invoices,
      };
    }
  );
};

/**
 * Creates or renews an organization subscription, updates AI audit entitlements, and generates invoice/receipt.
 *
 * @param {object} data
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const createOrRenewSubscription = async (data = {}, tenantContext = {}) => {
  // Determine organization
  let organizationId = data.organizationId;
  if (!tenantContext.isMasterAdmin || !organizationId) {
    organizationId = tenantContext.organizationId || organizationId;
  }

  if (!organizationId) {
    throw new ValidationError('Organization ID is required to create or renew subscription.');
  }

  const pricing = await getPricingConfig();
  const planName = (data.planName || 'ENTERPRISE').toUpperCase();
  const billingCycle = (data.billingCycle || 'MONTHLY').toUpperCase();
  const currency = (data.currency || pricing.currency || 'USD').toUpperCase();
  const hasAiAudit = data.hasAiAudit !== undefined ? Boolean(data.hasAiAudit) : true;
  const autoRenew = data.autoRenew !== undefined ? Boolean(data.autoRenew) : true;
  const userCapacity = parseInt(data.userCapacity || data.maxCreatedUsers || 50, 10);
  const userLicense = parseInt(data.userLicense || data.maxConcurrentSeats || data.maxSeats || 10, 10);
  const aiLicense = parseInt(data.aiLicense || data.maxAiAuditors || data.auditAiQuota || 5, 10);

  // Calculate pricing
  const basePrice = data.basePrice !== undefined ? parseFloat(data.basePrice) : pricing.basePrice;
  const aiAuditPrice = hasAiAudit
    ? (data.aiAuditPrice !== undefined ? parseFloat(data.aiAuditPrice) : pricing.aiAuditPrice)
    : 0;

  // Annual discount: 10 months for price of 12
  const cycleMultiplier = billingCycle === 'ANNUAL' ? 10 : 1;
  const subtotal = (basePrice + aiAuditPrice) * cycleMultiplier;
  const taxRate = 0.18; // 18% standard business VAT/GST
  const taxAmount = parseFloat((subtotal * taxRate).toFixed(2));
  const totalAmount = parseFloat((subtotal + taxAmount).toFixed(2));

  return withDbFallback(
    async () => {
      const org = await db('organizations').where('id', organizationId).first();
      if (!org) {
        throw new NotFoundError(`Organization with ID '${organizationId}' not found.`);
      }

      // Check for current active subscription
      const now = new Date();
      const currentSub = await db('subscriptions')
        .where('organization_id', organizationId)
        .where('status', 'ACTIVE')
        .where('end_date', '>=', now)
        .orderBy('end_date', 'desc')
        .first();

      let startDate = now;
      if (currentSub && new Date(currentSub.end_date) > now) {
        // Extend existing active subscription seamlessly
        startDate = new Date(currentSub.end_date);
      }

      // Calculate end date based on billing cycle
      const endDate = new Date(startDate);
      if (billingCycle === 'ANNUAL') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setDate(endDate.getDate() + 30);
      }

      // Mark older active subscriptions as renewed/superseded if starting immediately
      if (startDate.getTime() === now.getTime()) {
        await db('subscriptions')
          .where('organization_id', organizationId)
          .where('status', 'ACTIVE')
          .update({ status: 'EXPIRED', updated_at: now });
      }

      // Insert new Subscription
      const subId = (await db.raw('SELECT uuid_generate_v4() as id')).rows[0].id;
      const [newSub] = await db('subscriptions')
        .insert({
          id: subId,
          organization_id: organizationId,
          plan_name: planName,
          base_price: basePrice,
          ai_audit_price: aiAuditPrice,
          total_price: subtotal,
          currency,
          has_ai_audit: hasAiAudit,
          user_capacity: userCapacity,
          user_license: userLicense,
          ai_license: aiLicense,
          billing_cycle: billingCycle,
          start_date: startDate,
          end_date: endDate,
          status: 'ACTIVE',
          auto_renew: autoRenew,
          created_at: now,
          updated_at: now,
        })
        .returning('*');

      // Update organization AI Audit capability and User Quotas
      await db('organizations').where('id', organizationId).update({
        enable_ai_audit: hasAiAudit,
        max_created_users: userCapacity,
        max_concurrent_seats: userLicense,
        max_users: userLicense,
        max_ai_auditors: aiLicense,
        updated_at: now,
      });

      // Generate invoice & receipt
      const invNum = `INV-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const recNum = `RCP-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const paymentMethod = data.paymentMethod || 'CREDIT_CARD';

      const receiptData = {
        invoiceNumber: invNum,
        receiptNumber: recNum,
        organization: {
          id: org.id,
          name: org.name,
          slug: org.slug,
        },
        plan: planName,
        billingCycle,
        period: {
          from: startDate.toISOString(),
          to: endDate.toISOString(),
        },
        lineItems: [
          {
            description: `Master CRM Core Platform (${billingCycle})`,
            unitPrice: basePrice,
            multiplier: cycleMultiplier,
            amount: basePrice * cycleMultiplier,
          },
          hasAiAudit
            ? {
                description: `AI Voice & Speech Intelligence Engine Add-On (${billingCycle})`,
                unitPrice: aiAuditPrice,
                multiplier: cycleMultiplier,
                amount: aiAuditPrice * cycleMultiplier,
              }
            : null,
        ].filter(Boolean),
        subtotal,
        taxRate: '18%',
        taxAmount,
        totalPaid: totalAmount,
        currency,
        paymentStatus: 'PAID',
        paymentMethod,
        paidAt: now.toISOString(),
        notes: `Subscription active until ${endDate.toISOString().split('T')[0]}. Auto-renewal: ${autoRenew ? 'Enabled' : 'Disabled'}.`,
      };

      const [newInvoice] = await db('subscription_invoices')
        .insert({
          id: (await db.raw('SELECT uuid_generate_v4() as id')).rows[0].id,
          subscription_id: newSub.id,
          organization_id: organizationId,
          invoice_number: invNum,
          receipt_number: recNum,
          base_amount: basePrice * cycleMultiplier,
          ai_audit_amount: aiAuditPrice * cycleMultiplier,
          tax_amount: taxAmount,
          total_amount: totalAmount,
          currency,
          payment_status: 'PAID',
          payment_method: paymentMethod,
          paid_at: now,
          receipt_data: JSON.stringify(receiptData),
          created_at: now,
        })
        .returning('*');

      logger.info(`Subscription created/renewed for org '${org.name}' (${org.id}). Plan: ${planName}, Total: ${currency} ${totalAmount}`);

      return {
        subscription: {
          id: newSub.id,
          organizationId: newSub.organization_id,
          planName: newSub.plan_name,
          basePrice: parseFloat(newSub.base_price),
          aiAuditPrice: parseFloat(newSub.ai_audit_price),
          totalPrice: parseFloat(newSub.total_price),
          currency: newSub.currency,
          hasAiAudit: Boolean(newSub.has_ai_audit),
          billingCycle: newSub.billing_cycle,
          startDate: newSub.start_date,
          endDate: newSub.end_date,
          status: newSub.status,
          autoRenew: Boolean(newSub.auto_renew),
          createdAt: newSub.created_at,
        },
        invoice: {
          id: newInvoice.id,
          invoiceNumber: newInvoice.invoice_number,
          receiptNumber: newInvoice.receipt_number,
          totalAmount: parseFloat(newInvoice.total_amount),
          currency: newInvoice.currency,
          paymentStatus: newInvoice.payment_status,
          paidAt: newInvoice.paid_at,
        },
        receipt: receiptData,
      };
    },
    () => {
      // Mock fallback
      const now = new Date();
      const endDate = new Date(now.getTime() + (billingCycle === 'ANNUAL' ? 365 : 30) * 86400000);
      const subId = uuidv4();
      const invNum = `INV-2026-${Math.floor(100000 + Math.random() * 900000)}`;
      const recNum = `RCP-2026-${Math.floor(100000 + Math.random() * 900000)}`;

      const mockSub = {
        id: subId,
        organization_id: organizationId,
        plan_name: planName,
        base_price: basePrice,
        ai_audit_price: aiAuditPrice,
        total_price: subtotal,
        currency,
        has_ai_audit: hasAiAudit,
        billing_cycle: billingCycle,
        start_date: now,
        end_date: endDate,
        status: 'ACTIVE',
        auto_renew: autoRenew,
        created_at: now,
        updated_at: now,
      };

      const receiptData = {
        invoiceNumber: invNum,
        receiptNumber: recNum,
        organization: { id: organizationId, name: 'Active Org' },
        plan: planName,
        billingCycle,
        totalPaid: totalAmount,
        currency,
        paidAt: now.toISOString(),
      };

      const mockInv = {
        id: uuidv4(),
        subscription_id: subId,
        organization_id: organizationId,
        invoice_number: invNum,
        receipt_number: recNum,
        total_amount: totalAmount,
        currency,
        payment_status: 'PAID',
        receipt_data: receiptData,
        created_at: now,
      };

      if (!mockStore.data.subscriptions) mockStore.data.subscriptions = [];
      mockStore.data.subscriptions.push(mockSub);
      if (!mockStore.data.subscription_invoices) mockStore.data.subscription_invoices = [];
      mockStore.data.subscription_invoices.push(mockInv);

      const orgItem = (mockStore.data?.organizations || []).find((o) => o.id === organizationId);
      if (orgItem) {
        orgItem.max_created_users = userCapacity;
        orgItem.max_concurrent_human_seats = userLicense;
        orgItem.max_concurrent_seats = userLicense;
      }

      return {
        subscription: mockSub,
        invoice: mockInv,
        receipt: receiptData,
      };
    }
  );
};

// ==========================================
// INVOICES & RECEIPTS
// ==========================================

/**
 * Lists invoices with tenant scoping and pagination.
 *
 * @param {object} filters
 * @param {object} pagination
 * @param {object} tenantContext
 * @returns {Promise<{ invoices: Array<object>, total: number }>}
 */
const listInvoices = async (filters = {}, pagination = {}, tenantContext = {}) => {
  const page = parseInt(pagination.page, 10) || 1;
  const limit = parseInt(pagination.limit, 10) || 20;
  const offset = (page - 1) * limit;

  return withDbFallback(
    async () => {
      let query = db('subscription_invoices')
        .join('organizations', 'subscription_invoices.organization_id', 'organizations.id')
        .select(
          'subscription_invoices.*',
          'organizations.name as organization_name',
          'organizations.slug as organization_slug'
        );

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        query = query.where('subscription_invoices.organization_id', tenantContext.organizationId);
      } else if (filters.organizationId) {
        query = query.where('subscription_invoices.organization_id', filters.organizationId);
      }

      if (filters.paymentStatus) {
        query = query.where('subscription_invoices.payment_status', filters.paymentStatus.toUpperCase());
      }

      if (filters.search) {
        const term = `%${filters.search.toLowerCase()}%`;
        query = query.where((q) => {
          q.whereRaw('LOWER(subscription_invoices.invoice_number) LIKE ?', [term])
            .orWhereRaw('LOWER(subscription_invoices.receipt_number) LIKE ?', [term])
            .orWhereRaw('LOWER(organizations.name) LIKE ?', [term]);
        });
      }

      const countResult = await query.clone().clearSelect().count('* as total').first();
      const total = parseInt(countResult?.total || 0, 10);
      const rows = await query.orderBy('subscription_invoices.created_at', 'desc').limit(limit).offset(offset);

      const formatted = rows.map((r) => ({
        id: r.id,
        subscriptionId: r.subscription_id,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        organizationSlug: r.organization_slug,
        invoiceNumber: r.invoice_number,
        receiptNumber: r.receipt_number,
        baseAmount: parseFloat(r.base_amount),
        aiAuditAmount: parseFloat(r.ai_audit_amount),
        taxAmount: parseFloat(r.tax_amount),
        totalAmount: parseFloat(r.total_amount),
        currency: r.currency,
        paymentStatus: r.payment_status,
        paymentMethod: r.payment_method,
        paidAt: r.paid_at,
        createdAt: r.created_at,
      }));

      return { invoices: formatted, total, page, limit };
    },
    () => {
      let items = (mockStore.data?.subscription_invoices || []).map((inv) => {
        const org = (mockStore.data?.organizations || []).find((o) => o.id === inv.organization_id) || {};
        return {
          id: inv.id,
          subscriptionId: inv.subscription_id,
          organizationId: inv.organization_id,
          organizationName: org.name || 'Demo Org',
          organizationSlug: org.slug || 'demo-org',
          invoiceNumber: inv.invoice_number,
          receiptNumber: inv.receipt_number,
          baseAmount: parseFloat(inv.base_amount || 0),
          aiAuditAmount: parseFloat(inv.ai_audit_amount || 0),
          taxAmount: parseFloat(inv.tax_amount || 0),
          totalAmount: parseFloat(inv.total_amount || 0),
          currency: inv.currency || 'USD',
          paymentStatus: inv.payment_status || 'PAID',
          paymentMethod: inv.payment_method || 'CREDIT_CARD',
          paidAt: inv.paid_at,
          createdAt: inv.created_at,
        };
      });

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        items = items.filter((i) => i.organizationId === tenantContext.organizationId);
      }

      return {
        invoices: items.slice(offset, offset + limit),
        total: items.length,
        page,
        limit,
      };
    }
  );
};

/**
 * Retrieves a single invoice by ID or invoice number.
 *
 * @param {string} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getInvoiceById = async (id, tenantContext = {}) => {
  return withDbFallback(
    async () => {
      let query = db('subscription_invoices')
        .join('organizations', 'subscription_invoices.organization_id', 'organizations.id')
        .select(
          'subscription_invoices.*',
          'organizations.name as organization_name',
          'organizations.slug as organization_slug'
        )
        .where((q) => {
          q.where('subscription_invoices.id', id).orWhere('subscription_invoices.invoice_number', id);
        });

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        query = query.where('subscription_invoices.organization_id', tenantContext.organizationId);
      }

      const invoice = await query.first();
      if (!invoice) {
        throw new NotFoundError(`Invoice '${id}' not found or access denied.`);
      }

      const receiptData =
        typeof invoice.receipt_data === 'string'
          ? JSON.parse(invoice.receipt_data)
          : invoice.receipt_data;

      return {
        id: invoice.id,
        subscriptionId: invoice.subscription_id,
        organizationId: invoice.organization_id,
        organizationName: invoice.organization_name,
        organizationSlug: invoice.organization_slug,
        invoiceNumber: invoice.invoice_number,
        receiptNumber: invoice.receipt_number,
        baseAmount: parseFloat(invoice.base_amount),
        aiAuditAmount: parseFloat(invoice.ai_audit_amount),
        taxAmount: parseFloat(invoice.tax_amount),
        totalAmount: parseFloat(invoice.total_amount),
        currency: invoice.currency,
        paymentStatus: invoice.payment_status,
        paymentMethod: invoice.payment_method,
        paidAt: invoice.paid_at,
        receiptData,
        createdAt: invoice.created_at,
      };
    },
    () => {
      const inv = (mockStore.data?.subscription_invoices || []).find(
        (i) => i.id === id || i.invoice_number === id
      );
      if (!inv) throw new NotFoundError(`Invoice '${id}' not found.`);
      return inv;
    }
  );
};

/**
 * Retrieves full receipt payload for a given invoice ID.
 *
 * @param {string} id
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getReceiptByInvoiceId = async (id, tenantContext = {}) => {
  const invoice = await getInvoiceById(id, tenantContext);
  return {
    receiptNumber: invoice.receiptNumber,
    invoiceNumber: invoice.invoiceNumber,
    downloadFileName: `Receipt-${invoice.receiptNumber || invoice.invoiceNumber}.json`,
    receiptData: invoice.receiptData,
  };
};

// ==========================================
// ANALYTICS & LOGS SUMMARY
// ==========================================

/**
 * Generates platform-wide or tenant-specific subscription analytics summary.
 *
 * @param {object} tenantContext
 * @returns {Promise<object>}
 */
const getAnalyticsSummary = async (tenantContext = {}) => {
  return withDbFallback(
    async () => {
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 86400000);

      let subQuery = db('subscriptions');
      let invQuery = db('subscription_invoices').where('payment_status', 'PAID');

      if (!tenantContext.isMasterAdmin && tenantContext.organizationId) {
        subQuery = subQuery.where('organization_id', tenantContext.organizationId);
        invQuery = invQuery.where('organization_id', tenantContext.organizationId);
      }

      const [
        totalActive,
        totalAiAudit,
        expiringSoon,
        revenueResult,
        recentInvoices,
      ] = await Promise.all([
        subQuery.clone().where('status', 'ACTIVE').where('end_date', '>=', now).count('* as cnt').first(),
        subQuery.clone().where('status', 'ACTIVE').where('end_date', '>=', now).where('has_ai_audit', true).count('* as cnt').first(),
        subQuery.clone().where('status', 'ACTIVE').where('end_date', '>=', now).where('end_date', '<=', inSevenDays).count('* as cnt').first(),
        invQuery.clone().sum('total_amount as total_rev').first(),
        invQuery.clone().orderBy('created_at', 'desc').limit(5),
      ]);

      const activeCount = parseInt(totalActive?.cnt || 0, 10);
      const aiAuditCount = parseInt(totalAiAudit?.cnt || 0, 10);
      const expiringCount = parseInt(expiringSoon?.cnt || 0, 10);
      const totalRevenue = parseFloat(revenueResult?.total_rev || 0);

      // Approximate Monthly Recurring Revenue
      const pricing = await getPricingConfig();
      const estimatedMrr = activeCount * pricing.basePrice + aiAuditCount * pricing.aiAuditPrice;

      return {
        activeSubscriptions: activeCount,
        aiAuditSubscribers: aiAuditCount,
        subscriptionsExpiringSoon: expiringCount,
        totalRevenue,
        estimatedMrr,
        currency: pricing.currency,
        recentInvoices: recentInvoices.map((i) => ({
          id: i.id,
          invoiceNumber: i.invoice_number,
          receiptNumber: i.receipt_number,
          totalAmount: parseFloat(i.total_amount),
          currency: i.currency,
          paidAt: i.paid_at,
          paymentStatus: i.payment_status,
        })),
        asOf: now.toISOString(),
      };
    },
    () => {
      const subs = mockStore.data?.subscriptions || [];
      const invoices = mockStore.data?.subscription_invoices || [];
      return {
        activeSubscriptions: subs.filter((s) => s.status === 'ACTIVE').length,
        aiAuditSubscribers: subs.filter((s) => s.has_ai_audit).length,
        subscriptionsExpiringSoon: 0,
        totalRevenue: invoices.reduce((sum, i) => sum + parseFloat(i.total_amount || 0), 0),
        estimatedMrr: 698.00,
        currency: 'USD',
        recentInvoices: invoices.slice(0, 5),
        asOf: new Date().toISOString(),
      };
    }
  );
};

module.exports = {
  getPricingConfig,
  updatePricingConfig,
  listSubscriptions,
  getSubscriptionByOrg,
  createOrRenewSubscription,
  listInvoices,
  getInvoiceById,
  getReceiptByInvoiceId,
  getAnalyticsSummary,
};
