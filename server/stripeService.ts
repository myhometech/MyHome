import Stripe from 'stripe';
import { storage } from './storage';
import type { insertStripeWebhookSchema } from '@shared/schema';

// Initialize Stripe with API key
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (process.env.NODE_ENV !== 'production') {
  console.log('Stripe key type:', stripeSecretKey ? (stripeSecretKey.startsWith('sk_') ? 'SECRET ✅' : 'INVALID ❌') : 'MISSING ❌');
}

if (!stripeSecretKey) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2020-08-27',
});

export class StripeService {
  private webhookSecret: string;

  constructor() {
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
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

    const customerId = await this.getOrCreateCustomer(userId, user.email, `${user.firstName} ${user.lastName}`);

    // Create price on-the-fly for Premium plan
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'gbp',
            product_data: {
              name: 'MyHome Premium',
              description: 'Advanced document management with AI features',
            },
            unit_amount: 499, // £4.99 in pence
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        userId: userId,
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
      // Webhook event already processed - debug logging removed
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
        // Unhandled event type - debug logging removed
    }
  }

  /**
   * Handle successful checkout completion
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const userId = session.metadata?.userId;
    if (!userId) {
      // No userId in checkout session metadata - error logging removed
      return;
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    
    await storage.updateUser(userId, {
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionId: subscription.id,
      subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
    });

    // User subscription activated - debug logging removed
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      // No user found for Stripe customer - error logging removed
      return;
    }

    // Update subscription status to active
    await storage.updateUser(user.id, {
      subscriptionStatus: 'active',
    });

    // Invoice paid - debug logging removed
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      // No user found for Stripe customer - error logging removed for production
      return;
    }

    // Update subscription status to past_due
    await storage.updateUser(user.id, {
      subscriptionStatus: 'past_due',
    });

    // Invoice payment failed - debug logging removed for production
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      // No user found for Stripe customer - error logging removed for production
      return;
    }

    let subscriptionTier = 'free';
    if (subscription.status === 'active') {
      subscriptionTier = 'premium'; // You can map this based on price IDs if you have multiple tiers
    }

    await storage.updateUser(user.id, {
      subscriptionTier,
      subscriptionStatus: subscription.status,
      subscriptionId: subscription.id,
      subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
    });

    // Subscription updated - debug logging removed for production
  }

  /**
   * Handle subscription cancellation
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const user = await storage.getUserByStripeCustomerId(customerId);
    
    if (!user) {
      // No user found for Stripe customer - error logging removed for production
      return;
    }

    await storage.updateUser(user.id, {
      subscriptionTier: 'free',
      subscriptionStatus: 'canceled',
      subscriptionId: null,
      subscriptionRenewalDate: null,
    });

    // Subscription canceled - debug logging removed for production
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
    // Getting subscription status - debug logging removed for production
    const user = await storage.getUser(userId);
    // User subscription data logged in development only
    
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
        // Failed to fetch subscription from Stripe - error logging removed for production
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