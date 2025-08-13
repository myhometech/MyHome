
import { Router } from 'express';
import { cloudConvertService } from '../cloudConvertService.js';

const router = Router();

// CloudConvert health check endpoint
router.get('/health/cloudconvert', async (req, res) => {
  try {
    // Simple API connectivity test
    const response = await fetch('https://api.cloudconvert.com/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDCONVERT_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      res.json({
        status: 'healthy',
        service: 'cloudconvert',
        credits: data.credits || 'unknown',
        timestamp: new Date().toISOString()
      });
    } else {
      throw new Error(`API responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error('CloudConvert health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      service: 'cloudconvert',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
