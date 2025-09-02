import { db } from "../db";
import { modelEscalationLogs, type InsertModelEscalationLog, type ModelEscalationLog } from "@shared/schema";
import { nanoid } from "nanoid";
import { sql, eq, and, desc } from "drizzle-orm";

export interface EscalationAuditData {
  conversationId: string;
  messageId: string;
  tenantId: string;
  userId: string;
  initialModel: string;
  finalModel: string;
  escalationTrigger?: 'low_confidence' | 'insufficient_evidence' | 'complex_query' | 'manual_request';
  initialConfidence?: number;
  finalConfidence: number;
  tokensIn: number;
  tokensOut: number;
  latencyMsTotal: number;
  latencyMsLlm: number;
  docIdsTouched: number[];
  escalated: boolean;
  costUsd?: number;
}

export class ModelEscalationAuditor {
  private static instance: ModelEscalationAuditor;

  static getInstance(): ModelEscalationAuditor {
    if (!ModelEscalationAuditor.instance) {
      ModelEscalationAuditor.instance = new ModelEscalationAuditor();
    }
    return ModelEscalationAuditor.instance;
  }

  /**
   * Log model escalation event with comprehensive audit data
   */
  async logEscalation(data: EscalationAuditData): Promise<void> {
    try {
      const logEntry: InsertModelEscalationLog = {
        conversationId: data.conversationId,
        messageId: data.messageId,
        tenantId: data.tenantId,
        userId: data.userId,
        initialModel: data.initialModel,
        finalModel: data.finalModel,
        escalationTrigger: data.escalationTrigger || null,
        initialConfidence: data.initialConfidence?.toString() || null,
        finalConfidence: data.finalConfidence.toString(),
        tokensIn: data.tokensIn,
        tokensOut: data.tokensOut,
        latencyMsTotal: data.latencyMsTotal,
        latencyMsLlm: data.latencyMsLlm,
        docIdsTouched: data.docIdsTouched,
        escalated: data.escalated,
        costUsd: data.costUsd?.toString() || null,
      };

      await db.insert(modelEscalationLogs).values(logEntry);
      
      console.log(`[Model Escalation] ${data.initialModel} -> ${data.finalModel}: escalated=${data.escalated}, trigger=${data.escalationTrigger}, confidence=${data.finalConfidence}`);
    } catch (error) {
      console.error("[Model Escalation Auditor] Failed to log escalation:", error);
      // Don't throw error to avoid breaking main flow
    }
  }

  /**
   * Get escalation analytics for performance tracking
   */
  async getEscalationAnalytics(startDate: Date, endDate: Date): Promise<{
    totalRequests: number;
    totalEscalations: number;
    escalationRate: number;
    averageLatencyMs: number;
    averageConfidenceGain: number;
    totalCost: number;
    byTrigger: Record<string, { count: number; successRate: number }>;
    byModel: Record<string, { requests: number; escalations: number; avgLatency: number }>;
    dailyEscalations: Array<{ date: string; escalations: number; requests: number; cost: number }>;
  }> {
    try {
      const logs = await db
        .select()
        .from(modelEscalationLogs)
        .where(
          sql`created_at >= ${startDate} AND created_at <= ${endDate}`
        );

      const totalRequests = logs.length;
      const totalEscalations = logs.filter(log => log.escalated).length;
      const escalationRate = totalRequests > 0 ? (totalEscalations / totalRequests) * 100 : 0;
      const averageLatencyMs = logs.length > 0 
        ? logs.reduce((sum, log) => sum + log.latencyMsTotal, 0) / logs.length 
        : 0;
      
      // Calculate average confidence gain for escalated requests
      const escalatedLogs = logs.filter(log => log.escalated && log.initialConfidence);
      const averageConfidenceGain = escalatedLogs.length > 0
        ? escalatedLogs.reduce((sum, log) => {
            const initial = parseFloat((log.initialConfidence as string) || '0');
            const final = parseFloat((log.finalConfidence as string) || '0');
            return sum + (final - initial);
          }, 0) / escalatedLogs.length
        : 0;

      const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.costUsd || '0'), 0);

      // By escalation trigger
      const byTrigger: Record<string, { count: number; successRate: number }> = {};
      logs.forEach(log => {
        const trigger = (log.escalationTrigger as string) || 'unknown';
        if (!byTrigger[trigger]) {
          byTrigger[trigger] = { count: 0, successRate: 0 };
        }
        byTrigger[trigger].count++;
      });

      // Calculate success rates for each trigger
      Object.keys(byTrigger).forEach(trigger => {
        const triggerLogs = logs.filter(log => ((log.escalationTrigger as string) || 'unknown') === trigger);
        const successfulLogs = triggerLogs.filter(log => parseFloat((log.finalConfidence as string) || '0') >= 0.7);
        byTrigger[trigger].successRate = triggerLogs.length > 0 
          ? (successfulLogs.length / triggerLogs.length) * 100 
          : 0;
      });

      // By model
      const byModel: Record<string, { requests: number; escalations: number; avgLatency: number }> = {};
      logs.forEach(log => {
        const model = log.initialModel;
        if (!byModel[model]) {
          byModel[model] = { requests: 0, escalations: 0, avgLatency: 0 };
        }
        byModel[model].requests++;
        if (log.escalated) {
          byModel[model].escalations++;
        }
      });

      // Calculate average latency by model
      Object.keys(byModel).forEach(model => {
        const modelLogs = logs.filter(log => log.initialModel === model);
        byModel[model].avgLatency = modelLogs.length > 0
          ? modelLogs.reduce((sum, log) => sum + log.latencyMsLlm, 0) / modelLogs.length
          : 0;
      });

      // Daily escalations
      const dailyEscalations: Record<string, { escalations: number; requests: number; cost: number }> = {};
      logs.forEach(log => {
        const date = log.createdAt.toISOString().split('T')[0];
        if (!dailyEscalations[date]) {
          dailyEscalations[date] = { escalations: 0, requests: 0, cost: 0 };
        }
        dailyEscalations[date].requests++;
        if (log.escalated) {
          dailyEscalations[date].escalations++;
        }
        dailyEscalations[date].cost += parseFloat(log.costUsd || '0');
      });

      const dailyEscalationsArray = Object.entries(dailyEscalations).map(([date, data]) => ({
        date,
        ...data
      }));

      return {
        totalRequests,
        totalEscalations,
        escalationRate,
        averageLatencyMs,
        averageConfidenceGain,
        totalCost,
        byTrigger,
        byModel,
        dailyEscalations: dailyEscalationsArray
      };
    } catch (error) {
      console.error('[Model Escalation Auditor] Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get recent escalation events for debugging
   */
  async getRecentEscalations(limit: number = 50): Promise<ModelEscalationLog[]> {
    try {
      return await db
        .select()
        .from(modelEscalationLogs)
        .orderBy(desc(modelEscalationLogs.createdAt))
        .limit(limit);
    } catch (error) {
      console.error('[Model Escalation Auditor] Error getting recent escalations:', error);
      throw error;
    }
  }

  /**
   * Get escalation patterns for a specific user
   */
  async getUserEscalationPattern(userId: string, startDate: Date, endDate: Date): Promise<{
    totalQueries: number;
    escalationRate: number;
    averageConfidenceGain: number;
    preferredModels: Array<{ model: string; usage: number; successRate: number }>;
  }> {
    try {
      const userLogs = await db
        .select()
        .from(modelEscalationLogs)
        .where(
          and(
            eq(modelEscalationLogs.userId, userId),
            sql`created_at >= ${startDate} AND created_at <= ${endDate}`
          )
        );

      const totalQueries = userLogs.length;
      const escalations = userLogs.filter(log => log.escalated).length;
      const escalationRate = totalQueries > 0 ? (escalations / totalQueries) * 100 : 0;

      const escalatedLogs = userLogs.filter(log => log.escalated && log.initialConfidence);
      const averageConfidenceGain = escalatedLogs.length > 0
        ? escalatedLogs.reduce((sum, log) => {
            const initial = parseFloat((log.initialConfidence as string) || '0');
            const final = parseFloat((log.finalConfidence as string) || '0');
            return sum + (final - initial);
          }, 0) / escalatedLogs.length
        : 0;

      // Calculate preferred models
      const modelUsage: Record<string, { usage: number; successful: number }> = {};
      userLogs.forEach(log => {
        const model = log.finalModel;
        if (!modelUsage[model]) {
          modelUsage[model] = { usage: 0, successful: 0 };
        }
        modelUsage[model].usage++;
        if (parseFloat((log.finalConfidence as string) || '0') >= 0.7) {
          modelUsage[model].successful++;
        }
      });

      const preferredModels = Object.entries(modelUsage)
        .map(([model, data]) => ({
          model,
          usage: data.usage,
          successRate: data.usage > 0 ? (data.successful / data.usage) * 100 : 0
        }))
        .sort((a, b) => b.usage - a.usage);

      return {
        totalQueries,
        escalationRate,
        averageConfidenceGain,
        preferredModels
      };
    } catch (error) {
      console.error('[Model Escalation Auditor] Error getting user pattern:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const modelEscalationAuditor = ModelEscalationAuditor.getInstance();