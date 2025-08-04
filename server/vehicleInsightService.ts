/**
 * TICKET 4: Vehicle Insight Generation Service
 * 
 * Generates AI insights for vehicle MOT and tax due dates
 * Triggers on vehicle creation and DVLA refresh
 */

import { storage } from './storage.js';
import { llmClient } from './services/llmClient.js';
import type { Vehicle, InsertDocumentInsight } from '@shared/schema';

interface VehicleInsightData {
  vrn: string;
  dueDate: Date;
  type: 'vehicle:mot' | 'vehicle:tax';
  daysUntilDue: number;
  urgencyLevel: 'overdue' | 'urgent' | 'upcoming' | 'future';
}

interface GenerateVehicleInsightOptions {
  skipDuplicateCheck?: boolean;
  forceRegenerate?: boolean;
}

class VehicleInsightService {
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = llmClient.isAvailable();
    if (this.isAvailable) {
      const status = llmClient.getStatus();
      console.log(`✅ Vehicle Insight Service initialized with ${status.provider} (${status.model})`);
    } else {
      console.log('⚠️ Vehicle Insight Service disabled - LLM API key not found');
    }
  }

  /**
   * TICKET 4: Generate insights from vehicle MOT and tax dates
   */
  async generateVehicleInsights(
    vehicle: Vehicle, 
    userId: string,
    options: GenerateVehicleInsightOptions = {}
  ): Promise<{ motInsight?: any, taxInsight?: any }> {
    const results: { motInsight?: any, taxInsight?: any } = {};

    try {
      // Generate MOT insight if MOT expiry date exists
      if (vehicle.motExpiryDate) {
        const motInsightData = this.prepareInsightData(
          vehicle.vrn,
          vehicle.motExpiryDate,
          'vehicle:mot'
        );

        if (motInsightData) {
          const existingMotInsight = await this.checkExistingInsight(
            userId,
            vehicle.vrn,
            'vehicle:mot',
            motInsightData.dueDate
          );

          if (!existingMotInsight || options.forceRegenerate) {
            results.motInsight = await this.createVehicleInsight(
              motInsightData,
              userId,
              vehicle.id
            );
          }
        }
      }

      // Generate Tax insight if tax due date exists
      if (vehicle.taxDueDate) {
        const taxInsightData = this.prepareInsightData(
          vehicle.vrn,
          vehicle.taxDueDate,
          'vehicle:tax'
        );

        if (taxInsightData) {
          const existingTaxInsight = await this.checkExistingInsight(
            userId,
            vehicle.vrn,
            'vehicle:tax',
            taxInsightData.dueDate
          );

          if (!existingTaxInsight || options.forceRegenerate) {
            results.taxInsight = await this.createVehicleInsight(
              taxInsightData,
              userId,
              vehicle.id
            );
          }
        }
      }

      return results;
    } catch (error) {
      console.error(`[TICKET 4] Error generating vehicle insights for ${vehicle.vrn}:`, error);
      throw error;
    }
  }

  /**
   * Prepare insight data from vehicle dates
   */
  private prepareInsightData(
    vrn: string,
    dueDate: Date | string,
    type: 'vehicle:mot' | 'vehicle:tax'
  ): VehicleInsightData | null {
    if (!dueDate) return null;

    // Convert string dates to Date objects
    const dueDateObject = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;

    const now = new Date();
    const timeDiff = dueDateObject.getTime() - now.getTime();
    const daysUntilDue = Math.ceil(timeDiff / (1000 * 3600 * 24));

    // Determine urgency level
    let urgencyLevel: 'overdue' | 'urgent' | 'upcoming' | 'future';
    if (daysUntilDue < 0) {
      urgencyLevel = 'overdue';
    } else if (daysUntilDue <= 7) {
      urgencyLevel = 'urgent';
    } else if (daysUntilDue <= 30) {
      urgencyLevel = 'upcoming';
    } else {
      urgencyLevel = 'future';
    }

    return {
      vrn,
      dueDate: dueDateObject,
      type,
      daysUntilDue,
      urgencyLevel
    };
  }

  /**
   * Check for existing insight to prevent duplicates
   */
  private async checkExistingInsight(
    userId: string,
    vrn: string,
    type: 'vehicle:mot' | 'vehicle:tax',
    dueDate: Date
  ): Promise<any> {
    try {
      // Get all insights for the user and filter by type and VRN
      const insights = await storage.getInsights(userId);
      
      return insights.find(insight => {
        try {
          if (insight.type !== type || insight.metadata?.linkedVrn !== vrn) {
            return false;
          }
          
          // Convert insight.dueDate to Date object if it's a string
          const insightDate = typeof insight.dueDate === 'string' 
            ? new Date(insight.dueDate) 
            : insight.dueDate;
          
          if (!insightDate || !dueDate) return false;
          
          const insightDueDate = insightDate.getTime();
          const targetDueDate = dueDate.getTime();
          const timeDiff = Math.abs(insightDueDate - targetDueDate);
          return timeDiff < (24 * 60 * 60 * 1000); // Same day
        } catch (error) {
          console.error('Error checking existing insight:', error);
          return false;
        }
      });
    } catch (error) {
      console.error('Error checking existing insight:', error);
      return null;
    }
  }

  /**
   * Create vehicle insight with AI-generated message
   */
  private async createVehicleInsight(
    insightData: VehicleInsightData,
    userId: string,
    vehicleId?: string
  ): Promise<any> {
    const { message, title, actionUrl } = await this.generateInsightContent(insightData);

    // Determine priority based on urgency
    let priority: 'low' | 'medium' | 'high';
    switch (insightData.urgencyLevel) {
      case 'overdue':
      case 'urgent':
        priority = 'high';
        break;
      case 'upcoming':
        priority = 'medium';
        break;
      default:
        priority = 'low';
    }

    const insightPayload: InsertDocumentInsight = {
      documentId: null, // Vehicle insights are not tied to specific documents
      userId,
      insightId: `${insightData.type}-${insightData.vrn}-${insightData.dueDate.getTime()}`,
      message,
      type: insightData.type,
      title,
      content: message,
      confidence: 95, // High confidence for DVLA data
      priority,
      dueDate: insightData.dueDate,
      actionUrl,
      status: 'open',
      metadata: {
        linkedVrn: insightData.vrn,
        daysUntilDue: insightData.daysUntilDue,
        urgencyLevel: insightData.urgencyLevel,
        vehicleId,
        source: 'dvla'
      },
      source: 'ai',
      tier: 'primary',
      aiModel: llmClient.getStatus().model,
      insightVersion: 'v2.0'
    };

    return await storage.createDocumentInsight(insightPayload);
  }

  /**
   * Generate AI-powered insight content
   */
  private async generateInsightContent(insightData: VehicleInsightData): Promise<{
    message: string;
    title: string;
    actionUrl: string;
  }> {
    if (!this.isAvailable) {
      // Fallback to template-based messages when AI is not available
      return this.generateTemplateContent(insightData);
    }

    try {
      const insightType = insightData.type === 'vehicle:mot' ? 'MOT' : 'tax';
      const prompt = this.buildInsightPrompt(insightData, insightType);

      const startTime = Date.now();
      const response = await llmClient.generateText(prompt, {
        userId: 'system',
        route: '/api/vehicles/insights',
        requestId: `vehicle-insight-${Date.now()}`
      });
      const processingTime = Date.now() - startTime;

      console.log(`[TICKET 4] Generated ${insightType} insight for ${insightData.vrn} in ${processingTime}ms`);

      // Parse AI response (expecting JSON format)
      const aiResult = this.parseAIResponse(response);
      
      return {
        message: aiResult.message || this.generateTemplateContent(insightData).message,
        title: aiResult.title || this.generateTemplateContent(insightData).title,
        actionUrl: this.generateActionUrl(insightData.type)
      };

    } catch (error) {
      console.error('[TICKET 4] AI insight generation failed, falling back to template:', error);
      return this.generateTemplateContent(insightData);
    }
  }

  /**
   * Build AI prompt for insight generation
   */
  private buildInsightPrompt(insightData: VehicleInsightData, insightType: string): string {
    const { vrn, daysUntilDue, urgencyLevel } = insightData;
    const dueDate = insightData.dueDate.toLocaleDateString('en-GB');

    return `Generate a helpful vehicle ${insightType} reminder insight in JSON format.

Vehicle: ${vrn}
${insightType} due date: ${dueDate}
Days until due: ${daysUntilDue}
Urgency: ${urgencyLevel}

Requirements:
- Create a clear, actionable message for the vehicle owner
- Include specific advice based on urgency level
- Mention potential penalties for late renewals
- Keep tone professional but friendly
- Maximum 150 characters for message

Return JSON with:
{
  "message": "Clear, actionable message",
  "title": "Brief title (max 50 chars)"
}

Examples:
- Urgent: "Vehicle ${insightType} for ${vrn} expires in ${Math.abs(daysUntilDue)} days. Book now to avoid penalties and ensure road legal status."
- Overdue: "URGENT: Vehicle ${insightType} for ${vrn} expired ${Math.abs(daysUntilDue)} days ago. Renew immediately to avoid fines."`;
  }

  /**
   * Parse AI response with fallback
   */
  private parseAIResponse(response: string): { message?: string; title?: string } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.warn('[TICKET 4] Failed to parse AI response:', error);
      return {};
    }
  }

  /**
   * Generate template-based content when AI is unavailable
   */
  private generateTemplateContent(insightData: VehicleInsightData): {
    message: string;
    title: string;
    actionUrl: string;
  } {
    const { vrn, daysUntilDue, urgencyLevel, type } = insightData;
    const insightType = type === 'vehicle:mot' ? 'MOT' : 'tax';
    const dueDate = insightData.dueDate.toLocaleDateString('en-GB');

    let message: string;
    let title: string;

    switch (urgencyLevel) {
      case 'overdue':
        message = `URGENT: Vehicle ${insightType} for ${vrn} expired ${Math.abs(daysUntilDue)} days ago. Renew immediately to avoid penalties.`;
        title = `${insightType} Overdue - ${vrn}`;
        break;
      case 'urgent':
        message = `Vehicle ${insightType} for ${vrn} expires in ${daysUntilDue} days. Book renewal now to stay road legal.`;
        title = `${insightType} Due Soon - ${vrn}`;
        break;
      case 'upcoming':
        message = `Vehicle ${insightType} is due on ${dueDate} for ${vrn}. Renew on time to avoid penalties.`;
        title = `${insightType} Renewal Due - ${vrn}`;
        break;
      default:
        message = `Vehicle ${insightType} for ${vrn} is due on ${dueDate}. Set a reminder to renew on time.`;
        title = `${insightType} Future Renewal - ${vrn}`;
    }

    return {
      message,
      title,
      actionUrl: this.generateActionUrl(type)
    };
  }

  /**
   * Generate action URL based on insight type
   */
  private generateActionUrl(type: 'vehicle:mot' | 'vehicle:tax'): string {
    switch (type) {
      case 'vehicle:mot':
        return 'https://www.gov.uk/book-mot-test';
      case 'vehicle:tax':
        return 'https://www.gov.uk/vehicle-tax';
      default:
        return 'https://www.gov.uk/vehicle-tax';
    }
  }

  /**
   * Check service availability
   */
  isServiceAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Get service status
   */
  getServiceStatus() {
    return {
      available: this.isAvailable,
      provider: this.isAvailable ? llmClient.getStatus().provider : 'none',
      model: this.isAvailable ? llmClient.getStatus().model : 'none'
    };
  }
}

// Export singleton instance
export const vehicleInsightService = new VehicleInsightService();