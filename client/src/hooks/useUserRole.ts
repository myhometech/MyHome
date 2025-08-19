import { useQuery } from '@tanstack/react-query';

export interface UserRoleInfo {
  userId: string;
  email: string;
  household: {
    id: string;
    name: string;
    role: 'owner' | 'duo_partner' | 'household_user';
    displayName: string;
    permissions: {
      canInvite: boolean;
      canRemoveMembers: boolean;
      canDeleteDocuments: boolean;
      canEditCategories: boolean;
      canViewBilling: boolean;
      canManageSubscription: boolean;
    };
  } | null;
}

export interface HouseholdMember {
  id: string;
  userId: string;
  householdId: string;
  role: 'owner' | 'duo_partner' | 'household_user';
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  roleDisplayName: string;
  permissions: {
    canInvite: boolean;
    canRemoveMembers: boolean;
    canDeleteDocuments: boolean;
    canEditCategories: boolean;
    canViewBilling: boolean;
    canManageSubscription: boolean;
  };
}

// TICKET 3: Hook to get current user's role and permissions
export function useUserRole() {
  return useQuery<UserRoleInfo>({
    queryKey: ['/api/user/role'],
  });
}

// Hook to get household members with role information
export function useHouseholdMembers() {
  return useQuery<HouseholdMember[]>({
    queryKey: ['/api/household/members'],
  });
}

// Role-based permission helpers
export function canDeleteDocument(userRole?: string): boolean {
  return userRole === 'owner' || userRole === 'duo_partner';
}

export function canEditCategory(userRole?: string): boolean {
  return userRole === 'owner' || userRole === 'duo_partner';
}

export function canInviteMembers(userRole?: string): boolean {
  return userRole === 'owner' || userRole === 'duo_partner';
}

export function canRemoveMembers(userRole?: string): boolean {
  return userRole === 'owner';
}

export function canManageSubscription(userRole?: string): boolean {
  return userRole === 'owner';
}

export function getRoleColor(role: string): string {
  switch (role) {
    case 'owner':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'duo_partner':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'household_user':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

export function getRoleIcon(role: string) {
  switch (role) {
    case 'owner':
      return '👑';
    case 'duo_partner':
      return '🤝';
    case 'household_user':
      return '👤';
    default:
      return '👤';
  }
}