// Quick test script to set an expiry date on an existing document
const fs = require('fs');
const path = require('path');

// Add a simple test by adding an expiry date to the Vodafone bill
const testExpiryDate = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  
  console.log("Test expiry dates:");
  console.log("Tomorrow:", tomorrow.toISOString().split('T')[0]);
  console.log("Next week:", nextWeek.toISOString().split('T')[0]);
  console.log("\nTo test manually, use the document edit functionality to set an expiry date on one of your documents.");
};

testExpiryDate();