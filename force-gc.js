
#!/usr/bin/env node

// Force garbage collection via API endpoint
const forceGC = async () => {
  try {
    console.log('🗑️ Forcing garbage collection...');
    
    const response = await fetch('http://localhost:5000/api/memory/gc', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ GC Success:', result);
      console.log(`   Freed: ${result.stats?.freed?.toFixed(1)}MB`);
      console.log(`   Before: ${result.stats?.before?.toFixed(1)}MB`);
      console.log(`   After: ${result.stats?.after?.toFixed(1)}MB`);
    } else {
      console.log('❌ GC Failed:', result.message);
    }
  } catch (error) {
    console.error('❌ Failed to call GC endpoint:', error.message);
  }
};

// Also trigger emergency cleanup
const emergencyCleanup = async () => {
  try {
    console.log('🆘 Triggering emergency memory cleanup...');
    
    const response = await fetch('http://localhost:5000/api/memory/emergency-cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    console.log('🆘 Emergency cleanup result:', result);
  } catch (error) {
    console.error('❌ Failed to call emergency cleanup:', error.message);
  }
};

// Get memory stats
const getMemoryStats = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/memory/stats');
    const stats = await response.json();
    
    console.log('\n📊 Memory Statistics:');
    console.log(`   Heap Usage: ${stats.memory.heapPercent.toFixed(1)}%`);
    console.log(`   Heap Used: ${(stats.memory.heapUsed / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Heap Total: ${(stats.memory.heapTotal / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   RSS: ${(stats.memory.rss / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   GC Forced: ${stats.gc.forced} times`);
    
  } catch (error) {
    console.error('❌ Failed to get memory stats:', error.message);
  }
};

// Run all actions
(async () => {
  await getMemoryStats();
  await forceGC();
  await emergencyCleanup();
  
  // Wait a bit and check stats again
  setTimeout(async () => {
    console.log('\n--- After Cleanup ---');
    await getMemoryStats();
  }, 2000);
})();
