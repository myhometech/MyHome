// Quick test script for OCR functionality
const { extractTextFromImage } = require('./server/ocrService.ts');

async function testOCR() {
  try {
    console.log('Testing OCR with existing document...');
    
    // Use an existing uploaded image
    const result = await extractTextFromImage('./uploads/1753107396676-996930964.png', 'image/png');
    console.log('OCR Result:', result);
  } catch (error) {
    console.error('OCR Test failed:', error);
  }
}

testOCR();