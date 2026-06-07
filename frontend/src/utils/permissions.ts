import { UserRole, PermissionConfig } from '../types';

export const getPermissions = (role: UserRole): PermissionConfig => {
  switch (role) {
    case 'admin':
      return {
        canAddEmployee: true,
        canEditEmployee: true,
        canDeleteEmployee: true,
        canAddDepartment: true,
        canEditDepartment: true,
        canDeleteDepartment: true,
        canImport: true,
        canExport: true,
      };
    case 'hr':
      return {
        canAddEmployee: true,
        canEditEmployee: true,
        canDeleteEmployee: true,
        canAddDepartment: false,
        canEditDepartment: false,
        canDeleteDepartment: false,
        canImport: true,
        canExport: true,
      };
    case 'manager':
      return {
        canAddEmployee: true,
        canEditEmployee: true,
        canDeleteEmployee: true,
        canAddDepartment: false,
        canEditDepartment: false,
        canDeleteDepartment: false,
        canImport: false,
        canExport: false,
      };
    case 'employee':
    default:
      return {
        canAddEmployee: false,
        canEditEmployee: false,
        canDeleteEmployee: false,
        canAddDepartment: false,
        canEditDepartment: false,
        canDeleteDepartment: false,
        canImport: false,
        canExport: false,
      };
  }
};

export const getRoleName = (role: UserRole): string => {
  const roleNames: Record<UserRole, string> = {
    employee: '普通员工',
    manager: '部门经理',
    hr: 'HR',
    admin: '管理员',
  };
  return roleNames[role] || role;
};
