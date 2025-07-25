import { featureFlagService } from './featureFlagService';

async function main() {
  try {
    console.log('Starting feature flag initialization...');
    
    await featureFlagService.initializeFeatureFlags();
    
    console.log('Feature flags initialized successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Failed to initialize feature flags:', error);
    process.exit(1);
  }
}

main();