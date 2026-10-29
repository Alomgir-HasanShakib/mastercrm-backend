/**
 * @file subscription.controller.js
 * @description Controller actions handling HTTP requests for subscriptions, billing, invoices, and receipts.
 */

const subscriptionService = require('./subscription.service');
const { db } = require('../../database/connection');
const { success, paginated } = require('../../utils/response');
const { logOperation } = require('../../middlewares/auditLog.middleware');

/**
 * GET /api/v1/subscriptions/pricing
 * Get current platform pricing plans and base rates.
 */
const getPricing = async (req, res, next) => {
  try {
    const pricing = await subscriptionService.getPricingConfig();
    return success(res, pricing, 'Subscription pricing retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/v1/subscriptions/pricing
 * Update base CRM or AI Audit pricing (Master Admin only).
 */
const updatePricing = async (req, res, next) => {
  try {
    const updated = await subscriptionService.updatePricingConfig(req.body);

    logOperation({
      req,
      action: 'SUBSCRIPTION_PRICING_UPDATE',
      module: 'SUBSCRIPTIONS',
      entityType: 'pricing_config',
      entityId: 'PLATFORM_PRICING',
      newValues: req.body,
    });

    return success(res, updated, 'Subscription pricing updated successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions
 * List all subscriptions with tenant scoping and pagination.
 */
const listSubscriptions = async (req, res, next) => {
  try {
    const { subscriptions, total, page, limit } = await subscriptionService.listSubscriptions(
      req.query,
      { page: req.query.page, limit: req.query.limit },
      req.tenantContext
    );
    return paginated(res, subscriptions, { page, limit, total, totalPages: Math.ceil(total / limit) }, 'Subscriptions retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/current
 * GET /api/v1/subscriptions/my
 * Retrieves subscription for the caller's active organization.
 */
const getMySubscription = async (req, res, next) => {
  try {
    let organizationId =
      req.tenantContext?.organizationId ||
      req.user?.organizationId ||
      req.user?.organization_id;

    let vendorInfo = null;
    const vendorId = req.tenantContext?.vendorId || req.user?.vendorId || req.user?.vendor_id;
    if (vendorId) {
      try {
        const v = await db('vendors').where('id', vendorId).first();
        if (v) {
          vendorInfo = {
            id: v.id,
            name: v.name,
            code: v.code,
            contactPerson: v.contact_person,
            email: v.email || v.contact_email,
            phone: v.phone || v.contact_phone,
          };
          if (!organizationId && v.organization_id) {
            organizationId = v.organization_id;
          }
        }
      } catch (e) {
        // continue
      }
    }

    if (!organizationId) {
      return success(res, {
        organization: null,
        vendor: vendorInfo,
        subscription: null,
        hasActiveSubscription: false,
        status: 'NO_ORGANIZATION',
        superAdminContact: {
          name: 'Bussiness suite Super Admin',
          email: 'admin@mastercrm.com',
          phone: '+880 1800-000000',
        },
        recentInvoices: []
      }, 'No organization associated with current user');
    }

    const data = await subscriptionService.getSubscriptionByOrg(organizationId, req.tenantContext);
    return success(res, {
      ...data,
      vendor: vendorInfo,
    }, 'Current organization subscription retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/organizations/:organizationId
 * Retrieves subscription for a specific organization ID.
 */
const getSubscriptionByOrg = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    const data = await subscriptionService.getSubscriptionByOrg(organizationId, req.tenantContext);
    return success(res, data, 'Organization subscription retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * POST /api/v1/subscriptions
 * POST /api/v1/subscriptions/renew
 * Create or renew a subscription, generating an invoice and receipt.
 */
const createOrRenew = async (req, res, next) => {
  try {
    const result = await subscriptionService.createOrRenewSubscription(req.body, req.tenantContext);

    logOperation({
      req,
      action: 'SUBSCRIPTION_CREATE_OR_RENEW',
      module: 'SUBSCRIPTIONS',
      entityType: 'subscriptions',
      entityId: result?.subscription?.id || req.body?.organizationId || 'SUBSCRIPTION',
      newValues: {
        plan: req.body?.plan,
        seats: req.body?.seats,
        billingCycle: req.body?.billingCycle,
        capacity: req.body?.capacity || req.body?.includedAudits,
        status: result?.subscription?.status,
      },
      metadata: { invoiceId: result?.invoice?.id, receiptNumber: result?.receipt?.receiptNumber },
    });

    return success(res, result, 'Subscription created/renewed successfully and invoice generated', 201);
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/invoices
 * List billing invoices with tenant boundaries.
 */
const listInvoices = async (req, res, next) => {
  try {
    const { invoices, total, page, limit } = await subscriptionService.listInvoices(
      req.query,
      { page: req.query.page, limit: req.query.limit },
      req.tenantContext
    );
    return paginated(res, invoices, { page, limit, total, totalPages: Math.ceil(total / limit) }, 'Invoices retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/invoices/:id
 * Retrieve a specific invoice by ID or invoice number.
 */
const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await subscriptionService.getInvoiceById(req.params.id, req.tenantContext);
    return success(res, invoice, 'Invoice retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/invoices/:id/receipt
 * Download / view full receipt payload for an invoice.
 */
const getReceipt = async (req, res, next) => {
  try {
    const receipt = await subscriptionService.getReceiptByInvoiceId(req.params.id, req.tenantContext);
    return success(res, receipt, 'Receipt data retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/v1/subscriptions/analytics/summary
 * Platform subscription overview (active count, revenue, expiring subscriptions).
 */
const getAnalyticsSummary = async (req, res, next) => {
  try {
    const summary = await subscriptionService.getAnalyticsSummary(req.tenantContext);
    return success(res, summary, 'Subscription analytics summary retrieved successfully');
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  getPricing,
  updatePricing,
  listSubscriptions,
  getMySubscription,
  getSubscriptionByOrg,
  createOrRenew,
  listInvoices,
  getInvoiceById,
  getReceipt,
  getAnalyticsSummary,
};
