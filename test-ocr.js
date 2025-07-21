// Test script to verify OCR functionality
import { extractTextFromImage, supportsOCR } from './server/ocrService.js';

async function testOCR() {
  console.log('Testing OCR Service...');
  
  // Test mime type support
  console.log('JPEG support:', supportsOCR('image/jpeg')); // Should be true
  console.log('PDF support:', supportsOCR('application/pdf')); // Should be true
  console.log('DOC support:', supportsOCR('application/msword')); // Should be false
  
  // Create a simple test image (would need actual image for real test)
  console.log('OCR service functions loaded successfully');
  console.log('OpenAI API Key configured:', !!process.env.OPENAI_API_KEY);
}

testOCR().catch(console.error);