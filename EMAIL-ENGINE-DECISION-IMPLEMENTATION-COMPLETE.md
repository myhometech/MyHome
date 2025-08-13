# Email Engine Decision System Implementation Complete

## Overview

Successfully implemented a comprehensive feature flag system for email conversion engines that provides proper precedence handling, per-user rollout capabilities, and observability for email body PDF generation and attachment conversion.

## Key Components Implemented

### 1. Database Feature Flags Created
- `EMAIL_BODY_PDF_USE_CLOUDCONVERT` (default: false, 0% rollout)
- `EMAIL_ATTACHMENT_CONVERT_TO_PDF` (default: false, 0% rollout)

Both flags support:
- Global percentage-based rollout
- Per-user overrides 
- Tier-based access control
- Audit logging via feature_flag_events table

### 2. Engine Decision Service (`server/emailEngineDecision.ts`)
```typescript
export async function decideEngines(context: EngineDecisionContext): Promise<EngineDecision>
```

**Precedence Hierarchy:**
1. **Environment Variables** (highest) - `PDF_CONVERTER_ENGINE='cloudconvert'|'puppeteer'`
2. **Database Flags** - Feature flag service with per-user rollout
3. **Defaults** (lowest) - Puppeteer for body, no attachment conversion

**Return Value:**
```typescript
{
  body: 'cloudconvert' | 'puppeteer',
  convertAttachments: boolean,
  reason: string[] // ['env:cloudconvert'] or ['flag:body=true', 'flag:att=false']
}
```

### 3. Enhanced Unified Email Conversion Service

**Core Integration:**
- `convertEmail()` method now uses `decideEngines()` for all conversion decisions
- Selective attachment conversion based on `EMAIL_ATTACHMENT_CONVERT_TO_PDF` flag
- Decision reasons logged for observability

**CloudConvert Path:**
- `buildConvertInputArray()` respects `convertAttachments` flag
- Only includes non-PDF attachments when flag enabled

**Puppeteer Path:**
- Enhanced attachment processor respects conversion flag
- Maintains backward compatibility for body PDF generation

### 4. Enhanced Observability

**Metrics Integration:**
- `EmailConversionSummary` interface extended with `decisionReasons?: string[]`
- All conversion logs include engine decision reasoning
- Sentry breadcrumbs capture flag evaluation context

**Logging Format:**
```
🔄 Starting email conversion - Body: cloudconvert, Attachments: true, Reasons: env:cloudconvert
🎯 Engine decision: { bodyEngine: 'puppeteer', convertAttachments: false, reasons: ['flag:body=false', 'flag:att=false'] }
```

## Rollout Strategy

### Staging Validation
```bash
# Force CloudConvert for all conversions
export PDF_CONVERTER_ENGINE=cloudconvert
```

### Production Canary Rollout

1. **Email Body Conversion (5% → 25% → 50% → 100%)**
```sql
UPDATE feature_flags 
SET enabled = true, rollout_percentage = 5 
WHERE name = 'EMAIL_BODY_PDF_USE_CLOUDCONVERT';
```

2. **Attachment Conversion (after body conversion stable)**
```sql
UPDATE feature_flags 
SET enabled = true, rollout_percentage = 5 
WHERE name = 'EMAIL_ATTACHMENT_CONVERT_TO_PDF';
```

### Instant Rollback Options

**Environment Override (immediate):**
```bash
export PDF_CONVERTER_ENGINE=puppeteer
```

**Database Flag Disable (≤1 min):**
```sql
UPDATE feature_flags SET enabled = false WHERE name LIKE 'EMAIL_%_CLOUDCONVERT';
```

**Admin Cache Clear (immediate):**
- Feature flag cache TTL: 1 minute
- Admin actions trigger immediate cache invalidation

## Edge Behavior & Resilience

**Missing Flags:** Default to OFF (Puppeteer body, no attachment conversion)
**Database Unavailable:** Graceful fallback with `flag_eval_error` logging
**Invalid Flag Values:** Type-safe with validation and defaults

## Observability Features

**Decision Logging:**
- Environment override detection
- Flag evaluation results
- Fallback reason tracking

**Metrics Collection:**
- Engine choice reasoning
- Conversion success/failure rates
- Performance impact analysis

**Error Handling:**
- Database connection failures gracefully handled
- Flag evaluation errors logged but don't block conversion
- Maintains service availability during flag system issues

## Integration Points

**Email Webhook Route:**
- Seamlessly integrated with existing `/api/email-ingest` endpoint
- Maintains full backward compatibility
- Preserves existing attachment processing logic

**Feature Flag UI:**
- Admin dashboard shows email conversion flags
- Real-time flag status and rollout percentages
- User override management capabilities

## Testing & Validation

**Flag Precedence:**
- ✅ ENV override beats database flags
- ✅ Database flags beat defaults
- ✅ Graceful fallback on flag service failure

**Conversion Logic:**
- ✅ Body engine selection works correctly
- ✅ Selective attachment conversion respects flags
- ✅ Observability captures decision reasoning

**Operational:**
- ✅ Database flag creation successful
- ✅ Cache invalidation works properly
- ✅ Error scenarios handled gracefully

## Files Modified

### Core Implementation
- `server/emailEngineDecision.ts` (new)
- `server/unifiedEmailConversionService.ts` (enhanced)
- `server/metricsService.ts` (extended)

### Database Schema
- Feature flags table populated with email conversion flags
- Full audit trail via feature_flag_events

### Type Definitions
- Enhanced `UnifiedConversionInput` with user context
- Extended `ConversionResult` with decision reasons
- Updated `EmailConversionSummary` for observability

## Next Steps

1. **Deploy to staging** with `PDF_CONVERTER_ENGINE=cloudconvert`
2. **Validate end-to-end** email conversion flow
3. **Enable production canary** at 5% rollout for body conversion
4. **Monitor metrics** for 24h before increasing rollout
5. **Gradually ramp** to 100% over several days
6. **Enable attachment conversion** after body conversion proves stable

The system is now production-ready with comprehensive feature flagging, observability, and rollback capabilities.