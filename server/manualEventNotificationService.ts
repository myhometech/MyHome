import cron from 'node-cron';
import { storage } from './storage';
import type { ManualTrackedEvent, User, UserAsset } from '../shared/schema';

interface NotificationPayload {
  type: "manual_event";
  title: string;
  due_date: string;
  event_id: string;
  asset_name?: string;
  link: string;
}

/**
 * Notification Engine for Manual Tracked Events (TICKET B2)
 * Handles automated reminders for upcoming manually tracked dates
 */
export class ManualEventNotificationService {
  private static instance: ManualEventNotificationService;
  private isInitialized = false;

  static getInstance(): ManualEventNotificationService {
    if (!ManualEventNotificationService.instance) {
      ManualEventNotificationService.instance = new ManualEventNotificationService();
    }
    return ManualEventNotificationService.instance;
  }

  /**
   * Initialize the notification service with cron jobs
   */
  initialize(): void {
    if (this.isInitialized) {
      console.log('Manual event notification service already initialized');
      return;
    }

    // Run daily at 9:00 AM to check for upcoming events
    cron.schedule('0 9 * * *', async () => {
      console.log('Running daily manual event notification check...');
      await this.processNotifications();
    });

    this.isInitialized = true;
    console.log('✅ Manual event notification service initialized');
  }

  /**
   * Process all notification checks for all users
   */
  private async processNotifications(): Promise<void> {
    try {
      // Get all users to check their events
      // Note: For now, we'll need to implement getAllUsers in storage
      // For the MVP, we can work with specific user IDs
      console.log('Note: getAllUsers not yet implemented - manual trigger needed for testing');
      
      // For now, return early - users can manually trigger notifications via API
      return;
      
      // This code would execute when getAllUsers is implemented
      // for (const user of users) {
      //   await this.processUserNotifications(user.id);
      // }
    } catch (error) {
      console.error('Error processing manual event notifications:', error);
    }
  }

  /**
   * Process notifications for a specific user
   */
  private async processUserNotifications(userId: string): Promise<void> {
    try {
      // Get user preferences (if we implement notification preferences later)
      const user = await storage.getUser(userId);
      if (!user) return;

      // Get all active manual tracked events for the user
      const events = await storage.getManualTrackedEvents(userId);
      const activeEvents = events.filter(event => event.status === 'active');

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today

      for (const event of activeEvents) {
        const dueDate = new Date(event.dueDate);
        dueDate.setHours(0, 0, 0, 0); // Start of due date

        const timeDiff = dueDate.getTime() - today.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        // Check if we need to send a notification
        if (this.shouldSendNotification(daysDiff)) {
          await this.sendNotification(event, user, daysDiff);
        }
      }
    } catch (error) {
      console.error(`Error processing notifications for user ${userId}:`, error);
    }
  }

  /**
   * Determine if a notification should be sent based on days until due date
   */
  private shouldSendNotification(daysDiff: number): boolean {
    // Send notifications at 30 days, 7 days, and day of due date
    return daysDiff === 30 || daysDiff === 7 || daysDiff === 0;
  }

  /**
   * Send a notification for a manual tracked event
   */
  private async sendNotification(event: ManualTrackedEvent, user: User, daysDiff: number): Promise<void> {
    try {
      // Get asset name if linked
      let assetName: string | undefined;
      if (event.linkedAssetId) {
        try {
          const assets = await storage.getUserAssets(user.id);
          const asset = assets.find(a => a.id === parseInt(event.linkedAssetId));
          assetName = asset?.address || asset?.name;
        } catch (error) {
          console.warn(`Could not fetch asset for event ${event.id}:`, error);
        }
      }

      // Create notification payload
      const payload: NotificationPayload = {
        type: "manual_event",
        title: event.title,
        due_date: event.dueDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        event_id: event.id,
        asset_name: assetName,
        link: `/events/${event.id}`
      };

      // Log the notification (in production, this would be sent via email/push notification)
      const daysMessage = daysDiff === 0 ? 'today' : 
                         daysDiff === 1 ? 'tomorrow' : 
                         `in ${daysDiff} days`;
      
      console.log(`📅 NOTIFICATION: "${event.title}" is due ${daysMessage} for user ${user.email}`);
      console.log(`📋 Payload:`, JSON.stringify(payload, null, 2));

      // Here you would integrate with your notification system:
      // - Email service (SendGrid, etc.)
      // - Push notification service
      // - In-app notification storage
      
      // For now, we'll store it as a log entry that could be picked up by the frontend
      await this.logNotification(user.id, payload, daysDiff);

    } catch (error) {
      console.error(`Error sending notification for event ${event.id}:`, error);
    }
  }

  /**
   * Log notification for potential frontend pickup
   * In a production system, this would be stored in a notifications table
   */
  private async logNotification(userId: string, payload: NotificationPayload, daysDiff: number): Promise<void> {
    try {
      const logEntry = {
        userId,
        type: 'manual_event_reminder',
        payload,
        daysDiff,
        createdAt: new Date().toISOString()
      };

      // This could be stored in a notifications table for the frontend to display
      console.log(`💾 Notification logged:`, JSON.stringify(logEntry, null, 2));
      
      // TODO: Store in database notifications table when implemented
      // await storage.createNotification(logEntry);
      
    } catch (error) {
      console.error('Error logging notification:', error);
    }
  }

  /**
   * Manually trigger notification check for a specific user (useful for testing)
   */
  async triggerUserNotifications(userId: string): Promise<void> {
    console.log(`🔔 Manually triggering notifications for user ${userId}`);
    await this.processUserNotifications(userId);
  }

  /**
   * Manually trigger notification check for all users (useful for testing)
   */
  async triggerAllNotifications(): Promise<void> {
    console.log('🔔 Manually triggering all notifications');
    await this.processNotifications();
  }

  /**
   * Check if a specific event should trigger a notification today
   */
  async checkEventNotification(eventId: string, userId: string): Promise<boolean> {
    try {
      const event = await storage.getManualTrackedEvent(eventId, userId);
      if (!event || event.status !== 'active') return false;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueDate = new Date(event.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      const timeDiff = dueDate.getTime() - today.getTime();
      const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

      return this.shouldSendNotification(daysDiff);
    } catch (error) {
      console.error(`Error checking event notification for ${eventId}:`, error);
      return false;
    }
  }
}

// Export singleton instance
export const manualEventNotificationService = ManualEventNotificationService.getInstance();