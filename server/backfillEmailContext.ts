import { storage } from './storage.js';
import fetch from 'node-fetch';
import crypto from 'crypto';

// TICKET 9: Email Context Backfill Service
// Populates missing emailContext for legacy email attachments to enable "Store email as PDF" action

interface MailgunMessage {
  timestamp: number;
  'message-id': string;
  recipient: string;
  sender: string;
  subject: string;
  'message-headers'?: Array<[string, string]>;
}

interface MailgunResponse {
  items: MailgunMessage[];
  paging: {
    next?: string;
    previous?: string;
  };
}

interface BackfillMetrics {
  attempts: number;
  written: number;
  skipped: {
    no_match: number;
    ambiguous: number;
    api_error: number;
    outside_window: number;
    already_has_context: number;
  };
}

interface BackfillConfig {
  lookbackDays: number;
  windowMinutes: number;
  batchSize: number;
  dryRun: boolean;
  minConfidence: number;
}

export class EmailContextBackfillService {
  private mailgunApiKey: string;
  private mailgunDomain: string;
  private config: BackfillConfig;
  private metrics: BackfillMetrics = {
    attempts: 0,
    written: 0,
    skipped: {
      no_match: 0,
      ambiguous: 0,
      api_error: 0,
      outside_window: 0,
      already_has_context: 0
    }
  };

  constructor() {
    this.mailgunApiKey = process.env.MAILGUN_API_KEY || '';
    this.mailgunDomain = process.env.MAILGUN_DOMAIN || '';
    
    this.config = {
      lookbackDays: parseInt(process.env.BACKFILL_LOOKBACK_DAYS || '60'),
      windowMinutes: parseInt(process.env.BACKFILL_WINDOW_MINUTES || '5'),
      batchSize: parseInt(process.env.BACKFILL_BATCH_SIZE || '10'),
      dryRun: process.env.BACKFILL_DRY_RUN === '1',
      minConfidence: parseFloat(process.env.BACKFILL_MIN_CONFIDENCE || '0.8')
    };

    console.log('📧 TICKET 9: Email Context Backfill Service initialized');
    console.log(`🔧 Config: lookback=${this.config.lookbackDays}d, window=±${this.config.windowMinutes}m, dryRun=${this.config.dryRun}`);
  }

  async backfillEmailContext(userId?: string): Promise<BackfillMetrics> {
    if (!this.mailgunApiKey || !this.mailgunDomain) {
      throw new Error('MAILGUN_API_KEY and MAILGUN_DOMAIN are required for email context backfill');
    }

    this.resetMetrics();
    console.log('🚀 TICKET 9: Starting email context backfill job');

    try {
      // Find legacy email documents without emailContext
      const legacyDocs = await this.findLegacyEmailDocuments(userId);
      console.log(`📊 Found ${legacyDocs.length} legacy email documents to backfill`);

      if (legacyDocs.length === 0) {
        console.log('✅ No legacy documents found - backfill complete');
        return this.metrics;
      }

      // Process in batches to respect API limits
      for (let i = 0; i < legacyDocs.length; i += this.config.batchSize) {
        const batch = legacyDocs.slice(i, i + this.config.batchSize);
        console.log(`📦 Processing batch ${Math.floor(i / this.config.batchSize) + 1} (${batch.length} documents)`);

        await this.processBatch(batch);
        
        // Rate limiting between batches
        if (i + this.config.batchSize < legacyDocs.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.logFinalMetrics();
      return this.metrics;

    } catch (error) {
      console.error('❌ TICKET 9: Email context backfill failed:', error);
      throw error;
    }
  }

  private async findLegacyEmailDocuments(userId?: string) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - this.config.lookbackDays);

    console.log(`🔍 Searching for legacy email docs since: ${sinceDate.toISOString()}`);

    try {
      // Get all documents that are email sourced but missing emailContext
      const allDocs = await storage.getDocuments('');
      
      const legacyDocs = allDocs.filter((doc: any) => {
        // Filter criteria
        const isEmailSource = doc.uploadSource === 'email';
        const missingEmailContext = !doc.emailContext || !doc.emailContext.messageId;
        const withinWindow = new Date(doc.createdAt) >= sinceDate;
        const matchesUser = !userId || doc.userId === userId;

        return isEmailSource && missingEmailContext && withinWindow && matchesUser;
      });

      console.log(`📋 Legacy document filter results:`);
      console.log(`   - Total documents: ${allDocs.length}`);
      console.log(`   - Email sourced: ${allDocs.filter((d: any) => d.uploadSource === 'email').length}`);
      console.log(`   - Missing email context: ${legacyDocs.length}`);
      console.log(`   - Within ${this.config.lookbackDays} day window: ${legacyDocs.length}`);

      return legacyDocs;
    } catch (error) {
      console.error('❌ Failed to find legacy email documents:', error);
      throw error;
    }
  }

  private async processBatch(documents: any[]) {
    for (const doc of documents) {
      this.metrics.attempts++;
      
      try {
        await this.processDocument(doc);
      } catch (error) {
        console.error(`❌ Failed to process document ${doc.id}:`, error);
        this.metrics.skipped.api_error++;
      }
    }
  }

  private async processDocument(doc: any) {
    console.log(`🔍 Processing document: ${doc.name} (${doc.id}) created: ${doc.createdAt}`);

    // Skip if already has email context (idempotency)
    if (doc.emailContext?.messageId) {
      console.log(`⚠️ Document ${doc.id} already has emailContext - skipping`);
      this.metrics.skipped.already_has_context++;
      return;
    }

    // Search for matching Mailgun messages
    const candidates = await this.findMailgunCandidates(doc);
    
    if (candidates.length === 0) {
      console.log(`⚠️ No Mailgun candidates found for document ${doc.id}`);
      this.metrics.skipped.no_match++;
      return;
    }

    // Apply matching heuristics
    const match = this.selectBestMatch(doc, candidates);
    
    if (!match) {
      console.log(`⚠️ No confident match found for document ${doc.id} (${candidates.length} candidates)`);
      this.metrics.skipped.ambiguous++;
      return;
    }

    // Update document with email context
    await this.updateDocumentEmailContext(doc, match);
  }

  private async findMailgunCandidates(doc: any): Promise<MailgunMessage[]> {
    const docCreatedAt = new Date(doc.createdAt);
    const windowStart = new Date(docCreatedAt.getTime() - this.config.windowMinutes * 60 * 1000);
    const windowEnd = new Date(docCreatedAt.getTime() + this.config.windowMinutes * 60 * 1000);

    const url = `https://api.mailgun.net/v3/${this.mailgunDomain}/events`;
    const params = new URLSearchParams({
      event: 'delivered',
      begin: Math.floor(windowStart.getTime() / 1000).toString(),
      end: Math.floor(windowEnd.getTime() / 1000).toString(),
      limit: '50'
    });

    try {
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`api:${this.mailgunApiKey}`).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('⚠️ Mailgun rate limit hit - backing off');
          await new Promise(resolve => setTimeout(resolve, 5000));
          throw new Error('Rate limited');
        }
        throw new Error(`Mailgun API error: ${response.status}`);
      }

      const data = await response.json() as any;
      const messages: MailgunMessage[] = data.items || [];

      console.log(`📨 Found ${messages.length} Mailgun messages in ${this.config.windowMinutes}m window for doc ${doc.id}`);
      return messages;

    } catch (error) {
      console.error(`❌ Mailgun API error for document ${doc.id}:`, error);
      this.metrics.skipped.api_error++;
      return [];
    }
  }

  private selectBestMatch(doc: any, candidates: MailgunMessage[]): MailgunMessage | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
      console.log(`✅ Single candidate found for document ${doc.id} - using it`);
      return candidates[0];
    }

    // Score candidates based on multiple heuristics
    const scores = candidates.map(candidate => {
      let score = 0;
      let details: string[] = [];

      // 1. Time proximity (closer is better)
      const docTime = new Date(doc.createdAt).getTime();
      const msgTime = candidate.timestamp * 1000;
      const timeDiffMinutes = Math.abs(docTime - msgTime) / (60 * 1000);
      const timeScore = Math.max(0, 1 - timeDiffMinutes / this.config.windowMinutes);
      score += timeScore * 0.4;
      details.push(`time: ${timeScore.toFixed(2)} (±${timeDiffMinutes.toFixed(1)}m)`);

      // 2. Subject similarity (if we can guess from filename)
      const subjectScore = this.calculateSubjectSimilarity(doc.name, candidate.subject);
      score += subjectScore * 0.3;
      details.push(`subject: ${subjectScore.toFixed(2)}`);

      // 3. Recipient match (check if it's our domain/alias)
      const recipientScore = this.calculateRecipientScore(candidate.recipient);
      score += recipientScore * 0.3;
      details.push(`recipient: ${recipientScore.toFixed(2)}`);

      console.log(`📊 Candidate ${candidate['message-id']}: score=${score.toFixed(2)} (${details.join(', ')})`);
      return { candidate, score, details };
    });

    // Select best scoring candidate if confidence is high enough
    const best = scores.reduce((a, b) => a.score > b.score ? a : b);
    
    if (best.score >= this.config.minConfidence) {
      console.log(`✅ Selected best match for document ${doc.id}: score=${best.score.toFixed(2)}`);
      return best.candidate;
    } else {
      console.log(`⚠️ Best match score ${best.score.toFixed(2)} below confidence threshold ${this.config.minConfidence}`);
      return null;
    }
  }

  private calculateSubjectSimilarity(filename: string, subject: string): number {
    if (!filename || !subject) return 0;

    // Simple heuristic: check if filename contains words from subject
    const filenameWords = filename.toLowerCase().split(/[\s\-_\.]+/).filter(w => w.length > 2);
    const subjectWords = subject.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    if (filenameWords.length === 0 || subjectWords.length === 0) return 0;

    const matches = filenameWords.filter(fw => 
      subjectWords.some(sw => sw.includes(fw) || fw.includes(sw))
    );

    return matches.length / Math.max(filenameWords.length, subjectWords.length);
  }

  private calculateRecipientScore(recipient: string): number {
    if (!recipient) return 0;
    
    // Check if recipient contains our domain or known aliases
    const emailDomain = recipient.split('@')[1];
    const knownDomains = [this.mailgunDomain, 'myhome-docs.com'];
    
    return knownDomains.some(domain => emailDomain === domain) ? 1.0 : 0.1;
  }

  private async updateDocumentEmailContext(doc: any, message: MailgunMessage) {
    const emailContext = {
      messageId: message['message-id'],
      from: message.sender,
      to: [message.recipient],
      subject: message.subject,
      receivedAt: new Date(message.timestamp * 1000).toISOString()
    };

    // Generate ingestGroupId if missing
    const ingestGroupId = doc.ingestGroupId || this.generateIngestGroupId(doc.userId, message['message-id']);

    if (this.config.dryRun) {
      console.log(`🔥 DRY RUN: Would update document ${doc.id} with emailContext:`, emailContext);
      this.metrics.written++;
      return;
    }

    try {
      await storage.updateDocument(doc.id, doc.userId, {
        emailContext: JSON.stringify(emailContext),
        ingestGroupId
      });

      console.log(`✅ Updated document ${doc.id} with email context from message ${message['message-id']}`);
      this.metrics.written++;

    } catch (error) {
      console.error(`❌ Failed to update document ${doc.id}:`, error);
      this.metrics.skipped.api_error++;
      throw error;
    }
  }

  private generateIngestGroupId(userId: string, messageId: string): string {
    return crypto.createHash('sha256')
      .update(`${userId}:${messageId}`)
      .digest('hex')
      .substring(0, 16);
  }

  private resetMetrics() {
    this.metrics = {
      attempts: 0,
      written: 0,
      skipped: {
        no_match: 0,
        ambiguous: 0,
        api_error: 0,
        outside_window: 0,
        already_has_context: 0
      }
    };
  }

  private logFinalMetrics() {
    console.log('\n📊 TICKET 9: Email Context Backfill Results');
    console.log('============================================');
    console.log(`Total attempts: ${this.metrics.attempts}`);
    console.log(`Successfully written: ${this.metrics.written}`);
    console.log(`Skipped - no match: ${this.metrics.skipped.no_match}`);
    console.log(`Skipped - ambiguous: ${this.metrics.skipped.ambiguous}`);
    console.log(`Skipped - API error: ${this.metrics.skipped.api_error}`);
    console.log(`Skipped - outside window: ${this.metrics.skipped.outside_window}`);
    console.log(`Skipped - already has context: ${this.metrics.skipped.already_has_context}`);
    
    const totalSkipped = Object.values(this.metrics.skipped).reduce((a, b) => a + b, 0);
    const successRate = this.metrics.attempts > 0 ? (this.metrics.written / this.metrics.attempts * 100).toFixed(1) : '0';
    
    console.log(`\nSuccess rate: ${successRate}% (${this.metrics.written}/${this.metrics.attempts})`);
    console.log(`Dry run mode: ${this.config.dryRun ? 'YES' : 'NO'}`);
    console.log('============================================\n');
  }

  getMetrics(): BackfillMetrics {
    return { ...this.metrics };
  }
}