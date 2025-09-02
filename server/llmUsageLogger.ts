import { db } from "./db";
import { llmUsageLogs, type InsertLlmUsageLog } from "@shared/schema";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";

export interface LlmUsageContext {
  userId?: string;
  route?: string;
  model?: string;
  provider?: string;
}

export interface LlmUsageMetrics {
  tokensUsed: number;
  durationMs: number;
  status: "success" | "error";
  costUsd?: number;
}

export class LlmUsageLogger {
  private static instance: LlmUsageLogger;
  
  static getInstance(): LlmUsageLogger {
    if (!LlmUsageLogger.instance) {
      LlmUsageLogger.instance = new LlmUsageLogger();
    }
    return LlmUsageLogger.instance;
  }

  /**
   * Log LLM usage to database with comprehensive tracking
   */
  async logUsage(
    context: LlmUsageContext,
    metrics: LlmUsageMetrics
  ): Promise<void> {
    try {
      const requestId = nanoid();
      
      const logEntry: InsertLlmUsageLog = {
        requestId,
        userId: context.userId || null,
        provider: context.provider || "unknown",
        model: context.model || "unknown",
        tokensUsed: metrics.tokensUsed,
        costUsd: metrics.costUsd?.toString() || null,
        durationMs: metrics.durationMs,
        status: metrics.status,
        route: context.route || null,
      };

      await db.insert(llmUsageLogs).values(logEntry);
      
      console.log(`[LLM Usage] ${context.provider}/${context.model}: ${metrics.tokensUsed} tokens, ${metrics.durationMs}ms, ${metrics.status}`);
    } catch (error) {
      console.error("[LLM Usage Logger] Failed to log usage:", error);
      // Don't throw error to avoid breaking main flow
    }
  }

  /**
   * Log LLM usage with automatic timing
   */
  async logRequest<T>(
    context: LlmUsageContext,
    requestFn: () => Promise<T>,
    getTokensUsed: (result: T) => number,
    getCost?: (tokensUsed: number) => number
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await requestFn();
      const durationMs = Date.now() - startTime;
      const tokensUsed = getTokensUsed(result);
      const costUsd = getCost ? getCost(tokensUsed) : undefined;
      
      await this.logUsage(context, {
        tokensUsed,
        durationMs,
        status: "success",
        costUsd,
      });
      
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      await this.logUsage(context, {
        tokensUsed: 0,
        durationMs,
        status: "error",
      });
      
      throw error;
    }
  }

  /**
   * Calculate estimated cost for Together.ai/Mistral based on token usage
   * Current rates (approximate): $0.0002 per 1K tokens for Mistral-7B
   */
  calculateMistralCost(tokensUsed: number): number {
    const costPer1KTokens = 0.0002; // $0.0002 per 1K tokens
    return (tokensUsed / 1000) * costPer1KTokens;
  }

  /**
   * Calculate estimated cost for Together.ai Llama models
   */
  calculateTogetherCost(model: string, tokensUsed: number): number {
    // Together.ai pricing rates
    const rates: Record<string, number> = {
      'meta-llama/Llama-3.3-8B-Instruct-Turbo': 0.18 / 1_000_000, // $0.18 per 1M tokens
      'meta-llama/Llama-3.3-70B-Instruct-Turbo': 0.88 / 1_000_000, // $0.88 per 1M tokens
    };
    
    const rate = rates[model] || 0.18 / 1_000_000; // Default to 8B rate
    return tokensUsed * rate;
  }

  /**
   * Calculate estimated cost for OpenAI based on model and token usage
   */
  calculateOpenAICost(model: string, tokensUsed: number): number {
    const rates: Record<string, number> = {
      "gpt-4o": 0.005,     // $5.00 per 1M tokens
      "gpt-4o-mini": 0.00015, // $0.15 per 1M tokens  
      "gpt-3.5-turbo": 0.001,  // $1.00 per 1M tokens
    };
    
    const costPer1MTokens = rates[model] || 0.001; // Default fallback
    return (tokensUsed / 1_000_000) * costPer1MTokens;
  }
  /**
   * Get usage analytics for Admin Dashboard
   */
  async getUsageAnalytics(startDate: Date, endDate: Date): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageResponseTime: number;
    successRate: number;
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    byRoute: Record<string, { requests: number; tokens: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    try {
      const logs = await db
        .select()
        .from(llmUsageLogs)
        .where(
          sql`created_at >= ${startDate} AND created_at <= ${endDate}`
        );

      const totalRequests = logs.length;
      const totalTokens = logs.reduce((sum, log) => sum + log.tokensUsed, 0);
      const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.costUsd || '0'), 0);
      const averageResponseTime = logs.length > 0 
        ? logs.reduce((sum, log) => sum + (log.durationMs || 0), 0) / logs.length 
        : 0;
      const successfulRequests = logs.filter(log => log.status === 'success').length;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

      // By provider
      const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {};
      logs.forEach(log => {
        if (!byProvider[log.provider]) {
          byProvider[log.provider] = { requests: 0, tokens: 0, cost: 0 };
        }
        byProvider[log.provider].requests++;
        byProvider[log.provider].tokens += log.tokensUsed;
        byProvider[log.provider].cost += parseFloat(log.costUsd || '0');
      });

      // By route
      const byRoute: Record<string, { requests: number; tokens: number }> = {};
      logs.forEach(log => {
        const route = log.route || 'unknown';
        if (!byRoute[route]) {
          byRoute[route] = { requests: 0, tokens: 0 };
        }
        byRoute[route].requests++;
        byRoute[route].tokens += log.tokensUsed;
      });

      // Daily usage
      const dailyUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};
      logs.forEach(log => {
        const date = log.createdAt.toISOString().split('T')[0];
        if (!dailyUsage[date]) {
          dailyUsage[date] = { requests: 0, tokens: 0, cost: 0 };
        }
        dailyUsage[date].requests++;
        dailyUsage[date].tokens += log.tokensUsed;
        dailyUsage[date].cost += parseFloat(log.costUsd || '0');
      });

      const dailyUsageArray = Object.entries(dailyUsage).map(([date, data]) => ({
        date,
        ...data
      }));

      return {
        totalRequests,
        totalTokens,
        totalCost,
        averageResponseTime,
        successRate,
        byProvider,
        byRoute,
        dailyUsage: dailyUsageArray
      };
    } catch (error) {
      console.error('[LLM Usage Logger] Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get paginated usage logs for Admin Dashboard
   */
  async getUsageLogs(options: {
    page: number;
    limit: number;
    provider?: string;
    status?: string;
    userId?: string;
  }): Promise<{
    logs: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const { page, limit, provider, status, userId } = options;
      const offset = (page - 1) * limit;

      // Build where conditions
      const conditions = [];
      if (provider) {
        conditions.push(sql`provider = ${provider}`);
      }
      if (status) {
        conditions.push(sql`status = ${status}`);
      }
      if (userId) {
        conditions.push(sql`user_id = ${userId}`);
      }

      const whereClause = conditions.length > 0 
        ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
        : sql``;

      // Get total count
      const [{ count }] = await db.execute(
        sql`SELECT COUNT(*) as count FROM llm_usage_logs ${whereClause}`
      ) as any;

      // Get paginated results
      const logs = await db.execute(
        sql`SELECT * FROM llm_usage_logs ${whereClause} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`
      ) as any;

      const totalPages = Math.ceil(count / limit);

      return {
        logs: logs.rows,
        total: count,
        page,
        totalPages
      };
    } catch (error) {
      console.error('[LLM Usage Logger] Error getting logs:', error);
      throw error;
    }
  }

  /**
   * Get user-specific usage summary
   */
  async getUserUsage(userId: string, startDate: Date, endDate: Date): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageResponseTime: number;
    successRate: number;
    recentActivity: any[];
  }> {
    try {
      const logs = await db
        .select()
        .from(llmUsageLogs)
        .where(
          sql`user_id = ${userId} AND created_at >= ${startDate} AND created_at <= ${endDate}`
        )
        .orderBy(sql`created_at DESC`)
        .limit(50);

      const totalRequests = logs.length;
      const totalTokens = logs.reduce((sum, log) => sum + log.tokensUsed, 0);
      const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.costUsd || '0'), 0);
      const averageResponseTime = logs.length > 0 
        ? logs.reduce((sum, log) => sum + (log.durationMs || 0), 0) / logs.length 
        : 0;
      const successfulRequests = logs.filter(log => log.status === 'success').length;
      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0;

      return {
        totalRequests,
        totalTokens,
        totalCost,
        averageResponseTime,
        successRate,
        recentActivity: logs.slice(0, 10) // Latest 10 activities
      };
    } catch (error) {
      console.error('[LLM Usage Logger] Error getting user usage:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const llmUsageLogger = LlmUsageLogger.getInstance();