import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role?: string;
    household?: {
      id: string;
      role: string;
      name?: string;
    };
  };
}

// TICKET 3: Role hierarchy for permission checks
const ROLE_HIERARCHY = {
  owner: 3,
  duo_partner: 2,
  household_user: 1,
} as const;

export type HouseholdRole = keyof typeof ROLE_HIERARCHY;

/**
 * Middleware to load household role into request context
 */
export async function loadHouseholdRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.id) {
      return next();
    }

    // Get user's household membership
    const household = await storage.getUserHousehold(req.user.id);
    
    if (household) {
      req.user.household = {
        id: household.id,
        role: household.role,
        name: household.name,
      };
    }

    next();
  } catch (error) {
    console.error('Error loading household role:', error);
    next(); // Continue without household context
  }
}

/**
 * Check if user has required role level or higher
 */
export function hasRole(userRole: string, requiredRole: HouseholdRole): boolean {
  const userLevel = ROLE_HIERARCHY[userRole as HouseholdRole] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole];
  return userLevel >= requiredLevel;
}

/**
 * Middleware factory to require specific role
 */
export function requireRole(minRole: HouseholdRole) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.household) {
      return res.status(403).json({
        message: "Access denied: Must be in a household",
        required: `Household ${minRole} or higher`
      });
    }

    if (!hasRole(req.user.household.role, minRole)) {
      return res.status(403).json({
        message: "Access denied: Insufficient permissions",
        userRole: req.user.household.role,
        required: `${minRole} or higher`
      });
    }

    next();
  };
}

/**
 * Check if user can perform action on document
 */
export async function canAccessDocument(userId: string, documentId: number, action: 'read' | 'write' | 'delete'): Promise<boolean> {
  try {
    const document = await storage.getDocument(documentId, userId);
    if (!document) return false;

    // Users can always access their own documents
    if (document.userId === userId) return true;

    // Check household access
    const userHousehold = await storage.getUserHousehold(userId);
    if (!userHousehold) return false;

    // Document must belong to same household
    if (document.householdId !== userHousehold.id) return false;

    // Role-based permissions for household documents
    switch (action) {
      case 'read':
        // All household members can read
        return true;
      case 'write':
        // Only owner and duo_partner can modify household documents
        return hasRole(userHousehold.role, 'duo_partner');
      case 'delete':
        // Only owner and duo_partner can delete household documents
        return hasRole(userHousehold.role, 'duo_partner');
      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking document access:', error);
    return false;
  }
}

/**
 * Check if user can perform category actions
 */
export async function canAccessCategory(userId: string, categoryId: number, action: 'read' | 'write' | 'delete'): Promise<boolean> {
  try {
    const category = await storage.getCategory(categoryId);
    if (!category) return false;

    // Users can always access their own categories
    if (category.userId === userId) return true;

    // Check household access
    const userHousehold = await storage.getUserHousehold(userId);
    if (!userHousehold) return false;

    // Category must belong to same household
    if (category.householdId !== userHousehold.id) return false;

    // Role-based permissions for household categories
    switch (action) {
      case 'read':
        // All household members can read
        return true;
      case 'write':
      case 'delete':
        // Only owner and duo_partner can modify household categories
        return hasRole(userHousehold.role, 'duo_partner');
      default:
        return false;
    }
  } catch (error) {
    console.error('Error checking category access:', error);
    return false;
  }
}

/**
 * Middleware to check document access
 */
export function requireDocumentAccess(action: 'read' | 'write' | 'delete') {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id;
    const documentId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (isNaN(documentId)) {
      return res.status(400).json({ message: "Invalid document ID" });
    }

    const hasAccess = await canAccessDocument(userId, documentId, action);
    if (!hasAccess) {
      return res.status(403).json({
        message: `Access denied: Cannot ${action} this document`,
        action,
        documentId
      });
    }

    next();
  };
}

/**
 * Get role display name for UI
 */
export function getRoleDisplayName(role: string): string {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'duo_partner':
      return 'Duo Partner';
    case 'household_user':
      return 'Household User';
    default:
      return 'Member';
  }
}

/**
 * Get role permissions for UI
 */
export function getRolePermissions(role: string) {
  const permissions = {
    canInvite: false,
    canRemoveMembers: false,
    canDeleteDocuments: false,
    canEditCategories: false,
    canViewBilling: false,
    canManageSubscription: false,
  };

  switch (role) {
    case 'owner':
      return {
        ...permissions,
        canInvite: true,
        canRemoveMembers: true,
        canDeleteDocuments: true,
        canEditCategories: true,
        canViewBilling: true,
        canManageSubscription: true,
      };
    case 'duo_partner':
      return {
        ...permissions,
        canInvite: true,
        canDeleteDocuments: true,
        canEditCategories: true,
      };
    case 'household_user':
      return permissions; // Default read-only access
    default:
      return permissions;
  }
}