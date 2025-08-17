import Stripe from 'stripe';
import { storage } from './storage';
import type { InsertStripeWebhook, SubscriptionTier } from '@shared/schema';

// Flexible price ID mapping - configure these environment variables in Replit Secrets
// Single source of truth for Stripe price ID → tier mapping
// Adding new tiers requires only environment variable configuration
const PLAN_MAPPING: Record<string, string> = {
  [process.env.STRIPE_BEGINNER_PRICE_ID || 'price_beginner']: 'beginner',
  [process.env.STRIPE_PRO_PRICE_ID || 'price_pro']: 'pro', 
  [process.env.STRIPE_DUO_PRICE_ID || 'price_duo']: 'duo'
  // Future tiers can be added via environment variables without code changes
  // Example: [process.env.STRIPE_ENTERPRISE_PRICE_ID]: 'enterprise'
};

// Reverse mapping for tier to price ID lookup
const TIER_TO_PRICE_ID: Record<string, string> = Object.fromEntries(
  Object.entries(PLAN_MAPPING).map(([priceId, tier]) => [tier, priceId])
);

// Default plan configuration (used if Stripe prices are not set up)
const DEFAULT_PLAN_CONFIG = {
  beginner: { 
    amount: 299, // £2.99 in pence
    currency: 'gbp',
    name: 'MyHome Beginner', 
    description: 'Essential document management for getting started',
    features: {
      documents: 200,
      storage: '500MB',
      users: 1,
      ai_features: false
    }
  },
  pro: { 
    amount: 799, // £7.99 in pence
    currency: 'gbp',
    name: 'MyHome Pro', 
    description: 'Advanced document management with AI features',
    features: {
      documents: 5000,
      storage: '5GB',
      users: 1,
      ai_features: true
    }
  },
  duo: { 
    amount: 999, // £9.99 in pence
    currency: 'gbp',
    name: 'MyHome Duo', 
    description: 'Shared workspace for up to 2 family members',
    features: {
      documents: 10000,
      storage: '10GB', 
      users: 2,
      ai_features: true,
      household: true
    }
  }
};

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
console.log('Stripe key type:', stripeSecretKey ? (stripeSecretKey.startsWith('sk_') ? 'SECRET ✅' : 'INVALID ❌') : 'MISSING ❌');

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

export class StripeService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
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
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Return existing customer ID if available
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
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

    // Get plan details from price ID or default to pro
    const planType = PLAN_MAPPING[priceId] || 'pro';
    const planDetails = DEFAULT_PLAN_CONFIG[planType as keyof typeof DEFAULT_PLAN_CONFIG];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: planDetails.name,
              description: planDetails.description,
            },
            unit_amount: planDetails.amount,
            recurring: {
              interval: 'month',
            },
          },
          quantity: planType === 'duo' ? 2 : 1, // Duo plans have 2 seats
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
      subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
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
      subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
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
          // Update local database with current Stripe status
          await storage.updateUser(userId, {
            subscriptionTier: 'premium',
            subscriptionStatus: 'active',
            subscriptionId: subscription.id,
            subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
          });

          return {
            tier: 'premium',
            status: 'active',
            renewalDate: new Date(subscription.current_period_end * 1000),
            portalUrl: undefined, // Disable portal for now due to configuration issues
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