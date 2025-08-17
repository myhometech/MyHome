# Stripe Pricing Configuration Guide

## Overview
The MyHome subscription system now supports flexible pricing through Stripe integration. You can either:
1. Use actual Stripe price IDs for dynamic pricing
2. Rely on default pricing configuration for development/testing

## Configuration Options

### Option 1: Stripe Price IDs (Recommended for Production)

Set these environment variables in Replit Secrets:

```
STRIPE_BEGINNER_PRICE_ID=price_1234567890_beginner
STRIPE_PRO_PRICE_ID=price_1234567890_pro  
STRIPE_DUO_PRICE_ID=price_1234567890_duo
```

### Option 2: Default Configuration (Development/Testing)

If no Stripe price IDs are set, the system uses these defaults:

- **Beginner**: £2.99/month, 200 documents, 500MB storage, 1 user
- **Pro**: £7.99/month, 5,000 documents, 5GB storage, 1 user, AI features
- **Duo**: £9.99/month, 10,000 documents, 10GB storage, 2 users, AI features, household workspace

## How It Works

1. **Dynamic Price Fetching**: The system first tries to fetch prices from Stripe API using the configured price IDs
2. **Automatic Fallback**: If Stripe prices aren't found, it uses the default configuration
3. **Flexible Mapping**: Price IDs are mapped to subscription tiers (beginner, pro, duo)
4. **Feature Configuration**: Each tier includes feature definitions for proper access control

## API Endpoints

- `GET /api/stripe/plans` - Returns available pricing plans (either from Stripe or defaults)
- `POST /api/stripe/create-checkout-session` - Creates Stripe checkout with actual price ID
- `GET /api/stripe/subscription-status` - Returns user's current subscription status

## Frontend Integration

The pricing page (`/pricing`) automatically:
- Fetches real pricing data from the API
- Displays actual Stripe prices when available
- Falls back to default pricing for development
- Handles loading states and error scenarios

## Benefits

✅ **Flexible**: Works with or without Stripe configuration  
✅ **Production Ready**: Uses real Stripe prices when configured  
✅ **Development Friendly**: Default prices for local testing  
✅ **Maintainable**: Single source of truth for pricing logic  
✅ **Extensible**: Easy to add new tiers or modify pricing  

## Next Steps

1. **For Development**: The system works out of the box with default pricing
2. **For Production**: 
   - Create products and prices in your Stripe dashboard
   - Set the price ID environment variables in Replit Secrets
   - Test the checkout flow with Stripe test mode

The system intelligently adapts based on your configuration!