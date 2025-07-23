import Stripe from 'stripe';
import { storage } from './storage';
import type { InsertStripeWebhook } from '@shared/schema';

// Initialize Stripe with API key (fallback for development)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2024-12-18.acacia',
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

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
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
    
    await storage.updateUser(userId, {
      subscriptionTier: 'premium',
      subscriptionStatus: 'active',
      subscriptionId: subscription.id,
      subscriptionRenewalDate: new Date(subscription.current_period_end * 1000),
    });

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
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let portalUrl: string | undefined;
    if (user.stripeCustomerId) {
      try {
        const portal = await this.createPortalSession(userId, process.env.FRONTEND_URL || 'http://localhost:5000');
        portalUrl = portal.url;
      } catch (error) {
        console.error('Failed to create portal session:', error);
      }
    }

    return {
      tier: user.subscriptionTier || 'free',
      status: user.subscriptionStatus || 'inactive',
      renewalDate: user.subscriptionRenewalDate,
      portalUrl,
    };
  }
}

export const stripeService = new StripeService();