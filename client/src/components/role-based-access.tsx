import { ReactNode } from 'react';
import { useUserRole } from '@/hooks/useUserRole';

interface RoleGuardProps {
  children: ReactNode;
  requiredRole?: 'owner' | 'duo_partner' | 'household_user';
  requiredPermission?: keyof UserPermissions;
  fallback?: ReactNode;
}

interface UserPermissions {
  canInvite: boolean;
  canRemoveMembers: boolean;
  canDeleteDocuments: boolean;
  canEditCategories: boolean;
  canViewBilling: boolean;
  canManageSubscription: boolean;
}

// TICKET 3: Component to conditionally render based on role permissions
export function RoleGuard({ children, requiredRole, requiredPermission, fallback = null }: RoleGuardProps) {
  const { data: userRole, isLoading } = useUserRole();

  if (isLoading) {
    return null; // Or a loading spinner
  }

  if (!userRole?.household) {
    return <>{fallback}</>;
  }

  // Check role requirement
  if (requiredRole) {
    const roleHierarchy: Record<string, number> = {
      'household_user': 1,
      'duo_partner': 2,
      'owner': 3,
    };
    
    const userLevel = roleHierarchy[userRole.household.role] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;
    
    if (userLevel < requiredLevel) {
      return <>{fallback}</>;
    }
  }

  // Check permission requirement
  if (requiredPermission) {
    if (!userRole.household.permissions[requiredPermission]) {
      return <>{fallback}</>;
    }
  }

  return <>{children}</>;
}

// Hook for checking permissions in components
export function useRolePermissions() {
  const { data: userRole } = useUserRole();
  
  return {
    role: userRole?.household?.role,
    permissions: userRole?.household?.permissions || {
      canInvite: false,
      canRemoveMembers: false,
      canDeleteDocuments: false,
      canEditCategories: false,
      canViewBilling: false,
      canManageSubscription: false,
    },
    isOwner: userRole?.household?.role === 'owner',
    isDuoPartner: userRole?.household?.role === 'duo_partner',
    isHouseholdUser: userRole?.household?.role === 'household_user',
  };
}