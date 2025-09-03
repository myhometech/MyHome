#!/usr/bin/env tsx
/**
 * THMB-RECOVER: Queue diagnostics script
 * Run with: npx tsx scripts/queue-inspect.ts
 */

import { Queue, QueueEvents, Worker, Job } from 'bullmq';

const connection = { 
  connection: { 
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: 1,
  }
};
const name = 'thumbnail-generation'; // Must match queue name in thumbnailJobQueue.ts

async function main() {
  console.log(`🔍 [QUEUE-INSPECT] Connecting to Redis at ${connection.connection.host}:${connection.connection.port}`);
  console.log(`🔍 [QUEUE-INSPECT] Inspecting queue: ${name}`);
  
  try {
    const q = new Queue(name, connection);
    const counts = await q.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed', 'paused');
    console.log('[COUNTS]', counts);

    // Peek at 5 waiting jobs
    const waiting = await q.getWaiting(0, 4);
    console.log('[WAITING IDs]', waiting.map(j => j.id));
    
    if (waiting.length > 0) {
      console.log('[WAITING SAMPLE]', {
        id: waiting[0].id,
        data: waiting[0].data,
        opts: waiting[0].opts,
        createdAt: new Date(waiting[0].timestamp)
      });
    }

    // Check active jobs
    const active = await q.getActive(0, 4);
    console.log('[ACTIVE IDs]', active.map(j => j.id));

    // Check failed jobs
    const failed = await q.getFailed(0, 4);
    console.log('[FAILED IDs]', failed.map(j => j.id));
    if (failed.length > 0) {
      console.log('[FAILED SAMPLE]', {
        id: failed[0].id,
        failedReason: failed[0].failedReason,
        stacktrace: failed[0].stacktrace
      });
    }

    // Attach events for 60s to see if anything moves
    const qe = new QueueEvents(name, connection);
    qe.on('waiting', ({ jobId }) => console.log('[EVT] waiting', jobId));
    qe.on('active', ({ jobId }) => console.log('[EVT] active', jobId));
    qe.on('completed', ({ jobId }) => console.log('[EVT] completed', jobId));
    qe.on('failed', ({ jobId, failedReason }) => console.log('[EVT] failed', jobId, failedReason));
    qe.on('error', (err) => console.error('[EVT] error', err));
    
    console.log('[INFO] Listening 60s for activity...');
    setTimeout(async () => {
      console.log('[INFO] Stopping listener...');
      await Promise.all([q.close(), qe.close()]);
      console.log('[DONE]');
      process.exit(0);
    }, 60000);
    
  } catch (error) {
    console.error('[ERROR] Failed to connect to queue:', error);
    console.log('[INFO] This likely means Redis is not available or misconfigured');
    process.exit(1);
  }
}

main().catch(e => { 
  console.error('[FATAL]', e); 
  process.exit(1); 
});