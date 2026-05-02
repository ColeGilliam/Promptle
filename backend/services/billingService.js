import Stripe from 'stripe';
import { getUsersCollection } from '../config/db.js';
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_MONTHLY_PRICE_ID,
  STRIPE_TOKEN_PRICE_ID,
  CLIENT_URL,
} from '../config/config.js';
import { appLogger } from '../lib/logger.js';

const billingLogger = appLogger.child({ component: 'billing' });

const DEV_EMAIL = 'promptle99@gmail.com';
const TOKENS_PER_PURCHASE = 150;

export const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

async function getOrCreateStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { auth0Id: user.auth0Id },
  });
  await getUsersCollection().updateOne(
    { auth0Id: user.auth0Id },
    { $set: { stripeCustomerId: customer.id } }
  );
  return customer.id;
}

export async function createCheckoutSession({ auth0Id, mode }) {
  if (!stripe) throw new Error('Stripe is not configured.');
  const user = await getUsersCollection().findOne({ auth0Id });
  if (!user) throw new Error('User not found.');

  const customerId = await getOrCreateStripeCustomer(user);

  const baseParams = {
    customer: customerId,
    success_url: `${CLIENT_URL}/profile?billing=success`,
    cancel_url: `${CLIENT_URL}/profile?billing=cancel`,
    metadata: { auth0Id },
  };

  if (mode === 'subscription') {
    if (!STRIPE_MONTHLY_PRICE_ID) throw new Error('Subscription price not configured.');
    return stripe.checkout.sessions.create({
      ...baseParams,
      mode: 'subscription',
      line_items: [{ price: STRIPE_MONTHLY_PRICE_ID, quantity: 1 }],
    });
  }

  if (mode === 'tokens') {
    if (!STRIPE_TOKEN_PRICE_ID) throw new Error('Token price not configured.');
    return stripe.checkout.sessions.create({
      ...baseParams,
      mode: 'payment',
      line_items: [{ price: STRIPE_TOKEN_PRICE_ID, quantity: 1 }],
    });
  }

  throw new Error(`Unknown checkout mode: ${mode}`);
}

export async function handleWebhookEvent(rawBody, signature) {
  if (!stripe) throw new Error('Stripe is not configured.');
  const event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const auth0Id = session.metadata?.auth0Id;
      if (!auth0Id) break;

      if (session.mode === 'subscription' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        await getUsersCollection().updateOne(
          { auth0Id },
          {
            $set: {
              subscription: {
                status: sub.status,
                subscriptionId: sub.id,
                currentPeriodEnd: new Date(sub.current_period_end * 1000),
              },
            },
          }
        );
        billingLogger.info('subscription_activated', { auth0Id, subscriptionId: sub.id });
      } else if (session.mode === 'payment') {
        await getUsersCollection().updateOne(
          { auth0Id },
          { $inc: { tokenBalance: TOKENS_PER_PURCHASE } }
        );
        billingLogger.info('tokens_purchased', { auth0Id, tokens: TOKENS_PER_PURCHASE });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const customer = await stripe.customers.retrieve(sub.customer);
      const auth0Id = customer.metadata?.auth0Id;
      if (auth0Id) {
        await getUsersCollection().updateOne(
          { auth0Id },
          { $set: { 'subscription.status': 'canceled' } }
        );
        billingLogger.info('subscription_canceled', { auth0Id });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const customer = await stripe.customers.retrieve(sub.customer);
      const auth0Id = customer.metadata?.auth0Id;
      if (auth0Id) {
        await getUsersCollection().updateOne(
          { auth0Id },
          {
            $set: {
              'subscription.status': sub.status,
              'subscription.subscriptionId': sub.id,
              'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000),
            },
          }
        );
      }
      break;
    }

    default:
      break;
  }

  return event;
}

export async function checkAIAccess(auth0Id) {
  if (!auth0Id) return { allowed: false, code: 'not_authenticated' };

  let user;
  try {
    user = await getUsersCollection().findOne({ auth0Id });
  } catch {
    return { allowed: false, code: 'server_error' };
  }

  if (!user) return { allowed: false, code: 'not_authenticated' };

  if (user.email === DEV_EMAIL) return { allowed: true, type: 'dev' };

  if (user.subscription?.status === 'active') {
    return { allowed: true, type: 'subscription' };
  }

  if ((user.tokenBalance ?? 0) > 0) {
    return { allowed: true, type: 'tokens', balance: user.tokenBalance };
  }

  return { allowed: false, code: 'payment_required' };
}

// Atomically deduct 1 token. Returns true if successful (user had balance >= 1).
export async function consumeToken(auth0Id) {
  const result = await getUsersCollection().findOneAndUpdate(
    { auth0Id, tokenBalance: { $gte: 1 } },
    { $inc: { tokenBalance: -1 } },
    { returnDocument: 'after' }
  );
  return result !== null;
}

export async function getBillingStatus(auth0Id) {
  const user = await getUsersCollection().findOne(
    { auth0Id },
    { projection: { subscription: 1, tokenBalance: 1, stripeCustomerId: 1, email: 1 } }
  );
  if (!user) return null;
  const isActive = user.subscription?.status === 'active';
  const tokenBalance = user.tokenBalance ?? 0;
  return {
    subscription: user.subscription ?? null,
    tokenBalance,
    hasAccess: isActive || tokenBalance > 0 || user.email === DEV_EMAIL,
    isDev: user.email === DEV_EMAIL,
  };
}

export async function createPortalSession({ auth0Id }) {
  if (!stripe) throw new Error('Stripe is not configured.');
  const user = await getUsersCollection().findOne({ auth0Id });
  if (!user?.stripeCustomerId) throw new Error('No Stripe customer found.');
  return stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${CLIENT_URL}/profile`,
  });
}
