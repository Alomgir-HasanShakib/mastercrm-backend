/**
 * @file subscription.routes.js
 * @description Express router definitions for subscriptions, billing, pricing, and receipts.
 */

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const { setTenantContext } = require('../../middleware/tenancy');
const { checkRole } = require('../../middleware/rbac');
const { validate } = require('../../middleware/validator');
const subscriptionController = require('./subscription.controller');
const {
  listSubscriptionsSchema,
  createSubscriptionSchema,
  updatePricingSchema,
  listInvoicesSchema,
} = require('./subscription.validation');

const router = express.Router();

// Allow public/unauthenticated access to view current pricing
router.get('/pricing', subscriptionController.getPricing);

// All subsequent subscription management routes require authentication and tenant context
router.use(authenticate, setTenantContext);

// Pricing configuration (Master Admin only)
router.put(
  '/pricing',
  checkRole('MASTER_ADMIN'),
  validate(updatePricingSchema, 'body'),
  subscriptionController.updatePricing
);

// Analytics & Metrics summary
router.get('/analytics/summary', subscriptionController.getAnalyticsSummary);

// Current user's organization subscription
router.get('/current', subscriptionController.getMySubscription);
router.get('/my', subscriptionController.getMySubscription);

// Organization specific subscription
router.get('/organizations/:organizationId', subscriptionController.getSubscriptionByOrg);

// List subscriptions
router.get('/', validate(listSubscriptionsSchema, 'query'), subscriptionController.listSubscriptions);

// Create or renew subscription
router.post(
  '/',
  validate(createSubscriptionSchema, 'body'),
  subscriptionController.createOrRenew
);
router.post(
  '/renew',
  validate(createSubscriptionSchema, 'body'),
  subscriptionController.createOrRenew
);

// Billing Invoices & Receipts
router.get('/invoices', validate(listInvoicesSchema, 'query'), subscriptionController.listInvoices);
router.get('/invoices/:id', subscriptionController.getInvoiceById);
router.get('/invoices/:id/receipt', subscriptionController.getReceipt);

module.exports = router;
