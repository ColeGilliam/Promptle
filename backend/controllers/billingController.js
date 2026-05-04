import { appLogger } from '../lib/logger.js';
import {
  createCheckoutSession,
  handleWebhookEvent,
  getBillingStatus,
  createPortalSession,
} from '../services/billingService.js';

const billingLogger = appLogger.child({ component: 'billing' });

export async function createCheckout(req, res) {
  const { auth0Id, mode } = req.body || {};
  if (!auth0Id || !mode) {
    return res.status(400).json({ error: 'Missing auth0Id or mode.' });
  }
  if (mode !== 'subscription' && mode !== 'tokens') {
    return res.status(400).json({ error: 'Invalid mode. Use "subscription" or "tokens".' });
  }
  try {
    const session = await createCheckoutSession({ auth0Id, mode });
    res.json({ url: session.url });
  } catch (err) {
    billingLogger.error('create_checkout_failed', { auth0Id, mode, error: err });
    res.status(500).json({ error: err.message || 'Failed to create checkout session.' });
  }
}

export async function stripeWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).json({ error: 'Missing Stripe signature.' });
  try {
    await handleWebhookEvent(req.body, signature);
    res.json({ received: true });
  } catch (err) {
    billingLogger.error('webhook_failed', { error: err });
    res.status(400).json({ error: err.message });
  }
}

export async function billingStatus(req, res) {
  const { auth0Id } = req.params;
  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id.' });
  try {
    const status = await getBillingStatus(auth0Id);
    if (!status) return res.status(404).json({ error: 'User not found.' });
    res.json(status);
  } catch (err) {
    billingLogger.error('billing_status_failed', { auth0Id, error: err });
    res.status(500).json({ error: 'Failed to fetch billing status.' });
  }
}

export async function billingPortal(req, res) {
  const { auth0Id } = req.body || {};
  if (!auth0Id) return res.status(400).json({ error: 'Missing auth0Id.' });
  try {
    const session = await createPortalSession({ auth0Id });
    res.json({ url: session.url });
  } catch (err) {
    billingLogger.error('billing_portal_failed', { auth0Id, error: err });
    res.status(500).json({ error: err.message || 'Failed to open billing portal.' });
  }
}
