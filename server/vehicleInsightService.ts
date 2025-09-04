/**
 * TICKET 4: Vehicle Insight Service
 * 
 * Generates AI insights from MOT and Tax dates for DVLA-enriched vehicles
 */

import { storage } from './storage.js';
import { llmClient } from './services/llmClient.js';
import type { Vehicle, InsertDocumentInsight } from '../shared/schema';

interface VehicleInsightOptions {
  linkedVrn: string;
  dueDate: Date;
  type: 'vehicle:mot' | 'vehicle:tax';
  source: string;
  vehicleData: {
    make?: string;
    model?: string;
    colour?: string;
    fuelType?: string;
  };
}

interface InsightGenerationResult {
  success: boolean;
  insights: Array<{
    type: 'vehicle:mot' | 'vehicle:tax';
    message: string;
    title: string;
    content: string;
    priority: 'low' | 'medium' | 'high';
    dueDate: Date;
    linkedVrn: string;
  }>;
  error?: string;
}

class VehicleInsightService {
  private isAvailable: boolean = false;

  constructor() {
    this.isAvailable = llmClient.isAvailable();
    if (this.isAvailable) {
      const status = llmClient.getStatus();
      console.log(`✅ Vehicle Insight Service initialized with ${status.provider} (${status.model})`);
    } else {
      console.log('⚠️ Vehicle Insight Service using template fallback - LLM API key not configured');
    }
  }

  /**
   * TICKET 4: Generate insights from vehicle creation or DVLA refresh
   */
  async generateVehicleInsights(vehicle: Vehicle): Promise<InsightGenerationResult> {
    const insights: InsightGenerationResult['insights'] = [];

    try {
      // Generate MOT insight if MOT expiry date exists
      if (vehicle.motExpiryDate) {
        const motInsight = await this.generateMOTInsight({
          linkedVrn: vehicle.vrn,
          dueDate: new Date(vehicle.motExpiryDate),
          type: 'vehicle:mot',
          source: vehicle.source || 'dvla',
          vehicleData: {
            make: vehicle.make || undefined,
            model: vehicle.model || undefined,
            colour: vehicle.colour || undefined,
            fuelType: vehicle.fuelType || undefined
          }
        });

        if (motInsight) {
          insights.push(motInsight);
        }
      }

      // Generate Tax insight if tax due date exists
      if (vehicle.taxDueDate) {
        const taxInsight = await this.generateTaxInsight({
          linkedVrn: vehicle.vrn,
          dueDate: new Date(vehicle.taxDueDate),
          type: 'vehicle:tax',
          source: vehicle.source || 'dvla',
          vehicleData: {
            make: vehicle.make || undefined,
            model: vehicle.model || undefined,
            colour: vehicle.colour || undefined,
            fuelType: vehicle.fuelType || undefined
          }
        });

        if (taxInsight) {
          insights.push(taxInsight);
        }
      }

      return {
        success: true,
        insights
      };

    } catch (error) {
      console.error('Error generating vehicle insights:', error);
      return {
        success: false,
        insights: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * TICKET 4: Generate MOT insight with AI or template fallback
   */
  private async generateMOTInsight(options: VehicleInsightOptions): Promise<InsightGenerationResult['insights'][0] | null> {
    const { linkedVrn, dueDate, vehicleData } = options;
    const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    // Determine priority based on days until due
    let priority: 'low' | 'medium' | 'high' = 'low';
    if (daysUntilDue <= 7) priority = 'high';
    else if (daysUntilDue <= 30) priority = 'medium';

    try {
      if (this.isAvailable) {
        // Use AI to generate personalized insight
        const vehicleDescription = this.buildVehicleDescription(vehicleData);
        const prompt = this.buildMOTInsightPrompt(linkedVrn, dueDate, daysUntilDue, vehicleDescription);
        
        const aiResponse = await llmClient.createChatCompletion({
          messages: [
            { role: 'system', content: 'You are a helpful vehicle compliance assistant. Generate clear, actionable MOT reminders.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 200,
          temperature: 0.3
        });

        if (aiResponse && aiResponse.content) {
          return this.parseAIInsightResponse(aiResponse.content, 'vehicle:mot', linkedVrn, dueDate, priority);
        }
      }

      // Fallback to template-based insight
      return this.generateTemplateMOTInsight(linkedVrn, dueDate, daysUntilDue, priority, vehicleData);

    } catch (error) {
      console.error('Error generating MOT insight:', error);
      // Always fallback to template
      return this.generateTemplateMOTInsight(linkedVrn, dueDate, daysUntilDue, priority, vehicleData);
    }
  }

  /**
   * TICKET 4: Generate Tax insight with AI or template fallback
   */
  private async generateTaxInsight(options: VehicleInsightOptions): Promise<InsightGenerationResult['insights'][0] | null> {
    const { linkedVrn, dueDate, vehicleData } = options;
    const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    // Determine priority based on days until due
    let priority: 'low' | 'medium' | 'high' = 'low';
    if (daysUntilDue <= 7) priority = 'high';
    else if (daysUntilDue <= 30) priority = 'medium';

    try {
      if (this.isAvailable) {
        // Use AI to generate personalized insight
        const vehicleDescription = this.buildVehicleDescription(vehicleData);
        const prompt = this.buildTaxInsightPrompt(linkedVrn, dueDate, daysUntilDue, vehicleDescription);
        
        const aiResponse = await llmClient.createChatCompletion({
          messages: [
            { role: 'system', content: 'You are a helpful vehicle compliance assistant. Generate clear, actionable tax reminders.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 200,
          temperature: 0.3
        });

        if (aiResponse && aiResponse.content) {
          return this.parseAIInsightResponse(aiResponse.content, 'vehicle:tax', linkedVrn, dueDate, priority);
        }
      }

      // Fallback to template-based insight
      return this.generateTemplateTaxInsight(linkedVrn, dueDate, daysUntilDue, priority, vehicleData);

    } catch (error) {
      console.error('Error generating tax insight:', error);
      // Always fallback to template
      return this.generateTemplateTaxInsight(linkedVrn, dueDate, daysUntilDue, priority, vehicleData);
    }
  }

  /**
   * TICKET 4: Save insights to database with duplicate prevention
   */
  async saveVehicleInsights(vehicle: Vehicle, insights: InsightGenerationResult['insights']): Promise<boolean> {
    try {
      for (const insight of insights) {
        // Check for existing insight with same VRN, type, and due date (duplicate prevention)
        const existingInsights = await storage.getInsightsByUser(vehicle.userId);
        const duplicateInsight = existingInsights.insights.find((existing: any) => 
          existing.type === insight.type &&
          existing.metadata?.linkedVrn === insight.linkedVrn &&
          existing.dueDate?.getTime() === insight.dueDate.getTime()
        );

        if (duplicateInsight) {
          console.log(`[TICKET 4] Skipping duplicate insight for ${insight.linkedVrn} ${insight.type}`);
          continue;
        }

        // Create insight data
        const insightData: InsertDocumentInsight = {
          documentId: null, // Vehicle insights are not linked to documents
          userId: vehicle.userId,
          insightId: `${insight.type}-${insight.linkedVrn}-${insight.dueDate.getTime()}`,
          message: insight.message,
          type: insight.type,
          title: insight.title,
          content: insight.content,
          confidence: 85, // Template-based insights have high confidence
          priority: insight.priority,
          dueDate: insight.dueDate.toISOString().split('T')[0], // Convert Date to string format
          status: 'open',
          source: 'rule-based', // TICKET 4: Vehicle insights are rule-based
          tier: 'primary',
          metadata: {
            linkedVrn: insight.linkedVrn,
            vehicleSource: vehicle.source,
            dvlaLastRefreshed: vehicle.dvlaLastRefreshed
          }
        };

        await storage.createDocumentInsight(insightData);
        console.log(`[TICKET 4] Created ${insight.type} insight for vehicle ${insight.linkedVrn}`);
      }

      return true;
    } catch (error) {
      console.error('Error saving vehicle insights:', error);
      return false;
    }
  }

  /**
   * TICKET 4: Helper methods for insight generation
   */
  private buildVehicleDescription(vehicleData: VehicleInsightOptions['vehicleData']): string {
    const parts = [];
    if (vehicleData.make) parts.push(vehicleData.make);
    if (vehicleData.model) parts.push(vehicleData.model);
    if (vehicleData.colour) parts.push(vehicleData.colour);
    if (vehicleData.fuelType) parts.push(vehicleData.fuelType);
    return parts.join(' ') || 'vehicle';
  }

  private buildMOTInsightPrompt(vrn: string, dueDate: Date, daysUntilDue: number, vehicleDescription: string): string {
    return `Generate a helpful MOT reminder for vehicle ${vrn} (${vehicleDescription}).
    
MOT expires on: ${dueDate.toLocaleDateString()}
Days until due: ${daysUntilDue}

Create a clear, actionable message that:
- States the MOT expiry date
- Provides relevant urgency based on days remaining
- Includes helpful advice about booking early
- Mentions consequences of driving without valid MOT

Format as: Title|Message
Keep the title under 50 characters and message under 150 characters.`;
  }

  private buildTaxInsightPrompt(vrn: string, dueDate: Date, daysUntilDue: number, vehicleDescription: string): string {
    return `Generate a helpful vehicle tax reminder for vehicle ${vrn} (${vehicleDescription}).
    
Tax due on: ${dueDate.toLocaleDateString()}
Days until due: ${daysUntilDue}

Create a clear, actionable message that:
- States the tax due date
- Provides relevant urgency based on days remaining
- Includes advice about renewing online
- Mentions penalties for late payment

Format as: Title|Message
Keep the title under 50 characters and message under 150 characters.`;
  }

  private parseAIInsightResponse(
    response: string, 
    type: 'vehicle:mot' | 'vehicle:tax', 
    linkedVrn: string, 
    dueDate: Date, 
    priority: 'low' | 'medium' | 'high'
  ): InsightGenerationResult['insights'][0] {
    const parts = response.split('|');
    const title = parts[0]?.trim() || `${type === 'vehicle:mot' ? 'MOT' : 'Tax'} Due`;
    const message = parts[1]?.trim() || response.trim();

    return {
      type,
      message,
      title,
      content: message,
      priority,
      dueDate,
      linkedVrn
    };
  }

  private generateTemplateMOTInsight(
    linkedVrn: string, 
    dueDate: Date, 
    daysUntilDue: number, 
    priority: 'low' | 'medium' | 'high',
    vehicleData: VehicleInsightOptions['vehicleData']
  ): InsightGenerationResult['insights'][0] {
    const vehicleDesc = this.buildVehicleDescription(vehicleData);
    const formattedDate = dueDate.toLocaleDateString('en-GB');
    
    let title: string;
    let message: string;

    if (daysUntilDue <= 0) {
      title = 'MOT Expired';
      message = `Vehicle MOT expired on ${formattedDate} for ${linkedVrn}. Book immediately to avoid penalties.`;
    } else if (daysUntilDue <= 7) {
      title = 'MOT Due Soon';
      message = `Vehicle MOT expires on ${formattedDate} for ${linkedVrn}. Book your test now.`;
    } else if (daysUntilDue <= 30) {
      title = 'MOT Due This Month';
      message = `Vehicle MOT expires on ${formattedDate} for ${linkedVrn}. Book early to avoid delays.`;
    } else {
      title = 'MOT Reminder';
      message = `Vehicle MOT is due on ${formattedDate} for ${linkedVrn}. You can book up to a month early.`;
    }

    return {
      type: 'vehicle:mot',
      message,
      title,
      content: message,
      priority,
      dueDate,
      linkedVrn
    };
  }

  private generateTemplateTaxInsight(
    linkedVrn: string, 
    dueDate: Date, 
    daysUntilDue: number, 
    priority: 'low' | 'medium' | 'high',
    vehicleData: VehicleInsightOptions['vehicleData']
  ): InsightGenerationResult['insights'][0] {
    const vehicleDesc = this.buildVehicleDescription(vehicleData);
    const formattedDate = dueDate.toLocaleDateString('en-GB');
    
    let title: string;
    let message: string;

    if (daysUntilDue <= 0) {
      title = 'Vehicle Tax Overdue';
      message = `Vehicle tax was due on ${formattedDate} for ${linkedVrn}. Renew immediately to avoid penalties.`;
    } else if (daysUntilDue <= 7) {
      title = 'Tax Due Soon';
      message = `Vehicle tax is due on ${formattedDate} for ${linkedVrn}. Renew online at DVLA.`;
    } else if (daysUntilDue <= 30) {
      title = 'Tax Due This Month';
      message = `Vehicle tax is due on ${formattedDate} for ${linkedVrn}. Renew on time to avoid penalties.`;
    } else {
      title = 'Tax Reminder';
      message = `Vehicle tax is due on ${formattedDate} for ${linkedVrn}. Set a reminder to renew.`;
    }

    return {
      type: 'vehicle:tax',
      message,
      title,
      content: message,
      priority,
      dueDate,
      linkedVrn
    };
  }
}

export const vehicleInsightService = new VehicleInsightService();