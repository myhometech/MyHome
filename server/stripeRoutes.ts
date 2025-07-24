import { Request, Response, NextFunction } from 'express';
import { stripeService } from './stripeService';
// Auth functions from routes.ts - will be passed as middleware

/**
 * Create Stripe Checkout Session for subscription
 */
export async function createCheckoutSession(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
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
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
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
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    console.log('Getting subscription status for userId:', userId);
    const status = await stripeService.getSubscriptionStatus(userId);
    console.log('Subscription status response:', status);

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
    const plans = [
      {
        id: 'free',
        name: 'Free',
        description: 'Basic document management',
        price: 0,
        currency: 'GBP',
        interval: 'month',
        features: [
          'Up to 50 documents',
          '100MB storage',
          'Basic OCR',
          'Category organization'
        ],
        limits: {
          documents: 50,
          storage: 100 * 1024 * 1024 // 100MB in bytes
        }
      },
      {
        id: 'premium',
        name: 'Premium',
        description: 'Advanced features and unlimited storage',
        price: 4.99,
        currency: 'GBP',
        interval: 'month',
        stripePriceId: 'premium_monthly', // We'll use price_data instead of predefined price ID
        features: [
          'Unlimited documents',
          'Unlimited storage',
          'Advanced AI analysis',
          'Email forwarding',
          'Smart content extraction',
          'Priority support'
        ],
        limits: {
          documents: -1, // unlimited
          storage: -1 // unlimited
        }
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

// Cancel subscription endpoint
export async function cancelSubscription(req: any, res: any) {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId);
    
    if (!user?.subscriptionId) {
      return res.status(400).json({ message: 'No active subscription found' });
    }

    // Cancel the subscription at period end
    const subscription = await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true,
    });

    // Update local database
    await storage.updateUser(userId, {
      subscriptionStatus: 'canceled',
    });

    console.log(`Subscription ${subscription.id} canceled for user ${userId}`);
    res.json({ 
      message: 'Subscription canceled successfully',
      cancelAt: new Date(subscription.current_period_end * 1000),
    });
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ message: 'Failed to cancel subscription' });
  }
}