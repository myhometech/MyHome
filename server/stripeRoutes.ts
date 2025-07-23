import { Request, Response, NextFunction } from 'express';
import { stripeService } from './stripeService';
// Auth functions from routes.ts - will be passed as middleware

/**
 * Create Stripe Checkout Session for subscription
 */
export async function createCheckoutSession(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { priceId, successUrl, cancelUrl } = req.body;

    if (!priceId || !successUrl || !cancelUrl) {
      return res.status(400).json({ 
        message: 'Missing required fields: priceId, successUrl, cancelUrl' 
      });
    }

    const session = await stripeService.createCheckoutSession(
      userId,
      priceId,
      successUrl,
      cancelUrl
    );

    res.json({
      sessionId: session.sessionId,
      url: session.url
    });

  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ 
      message: 'Failed to create checkout session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Create Stripe Customer Portal Session
 */
export async function createPortalSession(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({ 
        message: 'Missing required field: returnUrl' 
      });
    }

    const session = await stripeService.createPortalSession(userId, returnUrl);

    res.json({
      url: session.url
    });

  } catch (error) {
    console.error('Error creating portal session:', error);
    res.status(500).json({ 
      message: 'Failed to create portal session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get user's subscription status
 */
export async function getSubscriptionStatus(req: Request, res: Response) {
  try {
    const userId = (req as any).userId;
    const status = await stripeService.getSubscriptionStatus(userId);

    res.json(status);

  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({ 
      message: 'Failed to get subscription status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Process Stripe webhooks
 */
export async function processWebhook(req: Request, res: Response) {
  try {
    const signature = req.get('stripe-signature');
    if (!signature) {
      return res.status(400).json({ message: 'Missing Stripe signature' });
    }

    const payload = req.body;
    
    await stripeService.processWebhook(payload, signature);

    res.json({ received: true });

  } catch (error) {
    console.error('Error processing Stripe webhook:', error);
    res.status(400).json({ 
      message: 'Webhook processing failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Get available subscription plans
 */
export async function getSubscriptionPlans(req: Request, res: Response) {
  try {
    // Define your subscription plans here
    // In a real application, you might fetch these from Stripe or a database
    const plans = [
      {
        id: 'free',
        name: 'Free',
        description: 'Basic document management',
        price: 0,
        currency: 'gbp',
        interval: null,
        features: [
          'Up to 50 documents',
          'Basic OCR',
          '100MB storage',
          'Email support'
        ],
        stripePriceId: null
      },
      {
        id: 'premium',
        name: 'Premium',
        description: 'Advanced features with AI',
        price: 9.99,
        currency: 'gbp',
        interval: 'month',
        features: [
          'Unlimited documents',
          'Advanced AI analysis',
          'Unlimited storage',
          'Email forwarding',
          'Smart categorization',
          'Priority support'
        ],
        stripePriceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium_monthly'
      }
    ];

    res.json({ plans });

  } catch (error) {
    console.error('Error getting subscription plans:', error);
    res.status(500).json({ 
      message: 'Failed to get subscription plans',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}