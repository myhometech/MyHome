
#!/usr/bin/env node

const { storage } = require('./dist/storage.js');

async function seedAdminData() {
  console.log('🌱 Seeding admin data...');
  
  try {
    // 1. Create sample feature flags
    console.log('Creating feature flags...');
    await storage.createFeatureFlag({
      id: 'advanced-ocr',
      name: 'Advanced OCR Processing',
      enabled: true,
      rolloutPercentage: 100,
      tierRequired: 'free',
      description: 'Enable advanced OCR features'
    });

    await storage.createFeatureFlag({
      id: 'ai-insights',
      name: 'AI Document Insights',
      enabled: true,
      rolloutPercentage: 75,
      tierRequired: 'premium',
      description: 'AI-powered document analysis'
    });

    await storage.createFeatureFlag({
      id: 'bulk-operations',
      name: 'Bulk Document Operations',
      enabled: false,
      rolloutPercentage: 0,
      tierRequired: 'premium',
      description: 'Bulk document management features'
    });

    // 2. Create system activities
    console.log('Creating system activities...');
    await storage.createSystemActivity({
      type: 'user_registration',
      severity: 'info',
      message: 'New user registered: test@example.com',
      userId: null,
      metadata: { source: 'email' }
    });

    await storage.createSystemActivity({
      type: 'document_upload',
      severity: 'info', 
      message: 'Document uploaded: sample-document.pdf',
      userId: 'admin-user-id',
      metadata: { fileSize: 1024000 }
    });

    await storage.createSystemActivity({
      type: 'system_error',
      severity: 'error',
      message: 'OCR processing failed for document ID: 123',
      userId: null,
      metadata: { errorCode: 'OCR_TIMEOUT' }
    });

    // 3. Create sample search analytics
    console.log('Creating search analytics...');
    await storage.createSearchAnalytic({
      searchQuery: 'insurance documents',
      resultsCount: 15,
      responseTime: 250,
      userId: 'admin-user-id',
      successful: true
    });

    await storage.createSearchAnalytic({
      searchQuery: 'tax documents 2024',
      resultsCount: 8,
      responseTime: 180,
      userId: 'admin-user-id', 
      successful: true
    });

    // 4. Create sample usage data
    console.log('Creating usage data...');
    await storage.createUsageRecord({
      userId: 'admin-user-id',
      service: 'openai',
      operation: 'gpt-4-turbo',
      tokensUsed: 1500,
      cost: 0.045,
      metadata: { documentId: 123, operation: 'insights' }
    });

    await storage.createUsageRecord({
      userId: 'admin-user-id',
      service: 'gcs',
      operation: 'upload',
      bytesProcessed: 5242880,
      cost: 0.002,
      metadata: { fileType: 'pdf' }
    });

    console.log('✅ Admin data seeded successfully!');
    
  } catch (error) {
    console.error('❌ Error seeding admin data:', error);
    process.exit(1);
  }
}

seedAdminData();
