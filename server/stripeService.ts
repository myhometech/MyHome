import Stripe from 'stripe';
import { storage } from './storage';
import type { InsertStripeWebhook, SubscriptionTier } from '@shared/schema';

// Dynamic plan mapping - validates environment variables exist
// No hardcoded fallbacks to prevent incorrect billing
const buildPlanMapping = (): Record<string, string> => {
  const mapping: Record<string, string> = {};
  
  // Required environment variables for each tier
  const requiredPriceIds = {
    STRIPE_BEGINNER_PRICE_ID: 'beginner',
    STRIPE_PRO_PRICE_ID: 'pro',
    STRIPE_DUO_PRICE_ID: 'duo'
  };
  
  // Only add mappings for configured price IDs
  Object.entries(requiredPriceIds).forEach(([envVar, tier]) => {
    const priceId = process.env[envVar];
    if (priceId && priceId.startsWith('price_')) {
      mapping[priceId] = tier;
    } else if (priceId) {
      console.warn(`Invalid price ID format for ${envVar}: ${priceId}. Must start with 'price_'`);
    }
  });
  
  // Add support for additional tiers via environment variables
  // Format: STRIPE_<TIER_NAME>_PRICE_ID
  Object.keys(process.env).forEach(key => {
    if (key.startsWith('STRIPE_') && key.endsWith('_PRICE_ID') && !(key in requiredPriceIds)) {
      const priceId = process.env[key];
      if (priceId && priceId.startsWith('price_')) {
        // Extract tier name: STRIPE_ENTERPRISE_PRICE_ID -> enterprise
        const tierName = key.replace('STRIPE_', '').replace('_PRICE_ID', '').toLowerCase();
        mapping[priceId] = tierName;
      }
    }
  });
  
  return mapping;
};

// Validate required environment variables
const validateStripeConfiguration = () => {
  const required = ['STRIPE_SECRET_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required Stripe environment variables: ${missing.join(', ')}`);
  }
  
  // Warn about missing webhook secret but don't fail
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️ STRIPE_WEBHOOK_SECRET not configured. Webhook processing will be disabled.');
  }
  
  // Validate at least one price ID is configured
  const priceIdKeys = Object.keys(process.env).filter(key => 
    key.startsWith('STRIPE_') && key.endsWith('_PRICE_ID')
  );
  
  if (priceIdKeys.length === 0) {
    console.warn('No Stripe price IDs configured. Subscription features will be limited.');
  }
  
  console.log(`Stripe configuration validated. ${priceIdKeys.length} price IDs configured.`);
};

// Run validation on startup
validateStripeConfiguration();

const PLAN_MAPPING = buildPlanMapping();

// Reverse mapping for tier to price ID lookup
const TIER_TO_PRICE_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PLAN_MAPPING).map(([priceId, tier]) => [tier, priceId])
);

// Dynamic plan configuration - loads from environment variables
const loadPlanConfiguration = () => {
  const config: Record<string, any> = {};
  
  // Define base configuration that can be overridden by environment variables
  const basePlans = ['beginner', 'pro', 'duo'];
  
  basePlans.forEach(tier => {
    const tierUpper = tier.toUpperCase();
    config[tier] = {
      name: process.env[`${tierUpper}_PLAN_NAME`] || `MyHome ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
      description: process.env[`${tierUpper}_PLAN_DESCRIPTION`] || `${tier} plan description`,
      currency: process.env[`${tierUpper}_PLAN_CURRENCY`] || 'gbp',
      features: {
        documents: parseInt(process.env[`${tierUpper}_PLAN_DOCUMENTS`] || '0'),
        storage: process.env[`${tierUpper}_PLAN_STORAGE`] || '0MB',
        users: parseInt(process.env[`${tierUpper}_PLAN_USERS`] || '1'),
        ai_features: process.env[`${tierUpper}_PLAN_AI_FEATURES`] === 'true',
        household: process.env[`${tierUpper}_PLAN_HOUSEHOLD`] === 'true'
      }
    };
  });
  
  // Add support for custom tiers via environment variables
  Object.keys(process.env).forEach(key => {
    if (key.endsWith('_PLAN_NAME') && !basePlans.some(plan => key.startsWith(plan.toUpperCase()))) {
      const tierName = key.replace('_PLAN_NAME', '').toLowerCase();
      const tierUpper = tierName.toUpperCase();
      
      config[tierName] = {
        name: process.env[`${tierUpper}_PLAN_NAME`],
        description: process.env[`${tierUpper}_PLAN_DESCRIPTION`] || `${tierName} plan`,
        currency: process.env[`${tierUpper}_PLAN_CURRENCY`] || 'gbp',
        features: {
          documents: parseInt(process.env[`${tierUpper}_PLAN_DOCUMENTS`] || '0'),
          storage: process.env[`${tierUpper}_PLAN_STORAGE`] || '0MB',
          users: parseInt(process.env[`${tierUpper}_PLAN_USERS`] || '1'),
          ai_features: process.env[`${tierUpper}_PLAN_AI_FEATURES`] === 'true',
          household: process.env[`${tierUpper}_PLAN_HOUSEHOLD`] === 'true'
        }
      };
    }
  });
  
  return config;
};

const DEFAULT_PLAN_CONFIG = loadPlanConfiguration();

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
console.log('Stripe key type:', stripeSecretKey ? (stripeSecretKey.startsWith('sk_') ? 'SECRET ✅' : 'INVALID ❌') : 'MISSING ❌');

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2025-06-30.basil',
});

export class StripeService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!this.webhookSecret) {
      console.warn('⚠️ Webhook secret not configured - webhook processing will be disabled');
    }
  }

  /**
   * Get available pricing plans from Stripe or defaults
   */
  async getAvailablePlans(): Promise<Array<{
    id: string;
    tier: SubscriptionTier;
    name: string;
    description: string;
    amount: number;
    currency: string;
    interval: string;
    features: any;
    popular?: boolean;
  }>> {
    const plans = [];

    // Try to fetch actual Stripe prices first
    try {
      const prices = await stripe.prices.list({
        active: true,
        type: 'recurring',
        expand: ['data.product'],
      });

      // Match Stripe prices to our tiers
      for (const price of prices.data) {
        const tier = PLAN_MAPPING[price.id] as keyof typeof DEFAULT_PLAN_CONFIG;
        if (tier && price.product && typeof price.product === 'object' && !price.product.deleted) {
          const config = DEFAULT_PLAN_CONFIG[tier];
          if (config) {
            plans.push({
              id: price.id,
              tier,
              name: price.product.name || config.name,
              description: price.product.description || config.description,
              amount: price.unit_amount || 0,
              currency: price.currency,
              interval: price.recurring?.interval || 'month',
              features: config.features,
              popular: tier === 'pro' // Mark Pro as popular
            });
          }
        }
      }
    } catch (error) {
      console.warn('Could not fetch Stripe prices, using defaults:', error);
    }

    // Fallback to defaults if no Stripe prices found
    if (plans.length === 0) {
      const tiers: (keyof typeof DEFAULT_PLAN_CONFIG)[] = ['beginner', 'pro', 'duo'];
      for (const tier of tiers) {
        const config = DEFAULT_PLAN_CONFIG[tier];
        plans.push({
          id: TIER_TO_PRICE_ID[tier] || `price_${tier}`,
          tier,
          name: config.name,
          description: config.description,
          amount: config.amount,
          currency: config.currency,
          interval: 'month',
          features: config.features,
          popular: tier === 'pro'
        });
      }
    }

    return plans.sort((a, b) => a.amount - b.amount);
  }

  /**
   * Create or retrieve Stripe customer for user
   */
  async getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
    try {
      const user = await storage.getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Return existing customer ID if available and verify it exists in Stripe
      if (user.stripeCustomerId) {
        try {
          await stripe.customers.retrieve(user.stripeCustomerId);
          return user.stripeCustomerId;
        } catch (error) {
          console.warn(`Stripe customer ${user.stripeCustomerId} not found, creating new one`);
          // Clear invalid customer ID
          await storage.updateUser(userId, { stripeCustomerId: null });
        }
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email,
        name: name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        metadata: {
          userId: userId,
        },
      });

      // Update user with Stripe customer ID
      await storage.updateUser(userId, {
        stripeCustomerId: customer.id,
      });

      return customer.id;
    } catch (error) {
      console.error('Error in getOrCreateCustomer:', error);
      throw new Error(`Failed to create or retrieve customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Stripe Checkout Session for subscription
   */
  async createCheckoutSession(
    userId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<{ sessionId: string; url: string }> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const customerId = await this.getOrCreateCustomer(userId, user.email || '', `${user.firstName} ${user.lastName}`);

    // Validate price ID exists in our mapping
    const planType = PLAN_MAPPING[priceId];
    if (!planType) {
      throw new Error(`Invalid price ID: ${priceId}. Please ensure the price ID is configured in environment variables.`);
    }
    
    const planDetails = DEFAULT_PLAN_CONFIG[planType as keyof typeof DEFAULT_PLAN_CONFIG];
    if (!planDetails) {
      throw new Error(`No configuration found for plan type: ${planType}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Use actual Stripe price ID
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId,
        planType: planType,
      },
    });

    if (!session.url) {
      throw new Error('Failed to create checkout session URL');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  /**
   * Create customer portal session for subscription management
   */
  async createPortalSession(userId: string, returnUrl: string): Promise<{ url: string }> {
    const user = await storage.getUser(userId);
    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found for user');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    return { url: session.url };
  }

  /**
   * Verify webhook signature and process event
   */
  async processWebhook(payload: string, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    // Check if we've already processed this event
    const existingWebhook = await storage.getStripeWebhookByEventId(event.id);
    if (existingWebhook) {
      console.log(`Webhook event ${event.id} already processed, skipping`);
      return;
    }

    // Store webhook event for deduplication
    const webhookData: InsertStripeWebhook = {
      eventId: event.id,
      eventType: event.type,
      data: event as any,
    };
    await storage.createStripeWebhook(webhookData);

    // Process the event
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle successful checkout completion
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      console.error('No userId in checkout session metadata');
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    
    // Determine the subscription tier from the price ID  
    const priceId = subscription.items?.data?.[0]?.price?.id;
    const subscriptionTier = PLAN_MAPPING[priceId] || 'pro';
    
    await storage.updateUser(userId, {
      subscriptionTier: subscriptionTier,
      subscriptionStatus: 'active',
      subscriptionId: subscription.id,
      subscriptionRenewalDate: new Date((subscription as any).current_period_end * 1000),
    });

    // If this is a Duo plan, create a household
    if (subscriptionTier === 'duo') {
      try {
        const user = await storage.getUser(userId);
        if (user) {
          const household = await storage.createHousehold({
            id: `hh_${Date.now()}_${Math.random().toString(36).substring(2)}`,
            stripeSubscriptionId: subscription.id,
            planType: 'duo',
            seatLimit: 2,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          // Add the user as the household owner
          await storage.createHouseholdMembership({
            userId: user.id,
            householdId: household.id,
            role: 'owner',
            joinedAt: new Date()
          });

          console.log(`Created household ${household.id} for Duo subscription ${subscription.id}`);
        }
      } catch (error) {
        console.error('Failed to create household for Duo subscription:', error);
        // Don't fail the webhook - user can still use individual features
      }
    }

    console.log(`User ${userId} subscription activated`);
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`No user found for Stripe customer ${customerId}`);
      return;
    }

    // Update subscription status to active
    await storage.updateUser(user.id, {
      subscriptionStatus: 'active',
    });

    console.log(`Invoice paid for user ${user.id}`);
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`No user found for Stripe customer ${customerId}`);
      return;
    }

    // Update subscription status to past_due
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due',
    });

    console.log(`Invoice payment failed for user ${user.id}`);
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`No user found for Stripe customer ${customerId}`);
      return;
    }

    // Determine the subscription tier from the price ID  
    const priceId = subscription.items?.data?.[0]?.price?.id;
    let subscriptionTier = 'free';
    if (subscription.status === 'active') {
      subscriptionTier = PLAN_MAPPING[priceId] || 'pro';
    }

    await storage.updateUser(user.id, {
      subscriptionTier,
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
      subscriptionRenewalDate: new Date((subscription as any).current_period_end * 1000),
    });

    console.log(`Subscription updated for user ${user.id}: ${subscription.status}`);
  }

  /**
   * Handle subscription cancellation
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      console.error(`No user found for Stripe customer ${customerId}`);
      return;
    }

    await storage.updateUser(user.id, {
      subscriptionTier: 'free',
      subscriptionStatus: 'canceled',
      subscriptionId: null,
      subscriptionRenewalDate: null,
    });

    console.log(`Subscription canceled for user ${user.id}`);
  }

  /**
   * Get subscription status for user
   */
  async getSubscriptionStatus(userId: string): Promise<{
    tier: string;
    status: string;
    renewalDate?: Date | null;
    portalUrl?: string;
  }> {
    console.log('Getting subscription status for userId:', userId);
    const user = await storage.getUser(userId);
    console.log('Found user:', user ? 'Yes' : 'No');
    console.log('User subscription data:', {
      tier: user?.subscriptionTier,
      status: user?.subscriptionStatus,
      customerId: user?.stripeCustomerId
    });
    
    if (!user) {
      throw new Error('User not found');
    }

    // If user has a Stripe customer ID, try to get real-time status from Stripe
    if (user.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0];
          const priceId = subscription.items?.data?.[0]?.price?.id;
          const subscriptionTier = PLAN_MAPPING[priceId] || 'free';
          
          // Update local database with current Stripe status
          await storage.updateUser(userId, {
            subscriptionTier,
            subscriptionStatus: 'active',
            subscriptionId: subscription.id,
            subscriptionRenewalDate: new Date((subscription as any).current_period_end * 1000),
          });

          return {
            tier: subscriptionTier,
            status: 'active',
            renewalDate: new Date((subscription as any).current_period_end * 1000),
            portalUrl: undefined, // Will enable after portal configuration
          };
        }
      } catch (error) {
        console.error('Failed to fetch subscription from Stripe:', error);
      }
    }

    return {
      tier: user.subscriptionTier || 'free',
      status: user.subscriptionStatus || 'inactive',
      renewalDate: user.subscriptionRenewalDate,
    };
  }
}

export const stripeService = new StripeService();