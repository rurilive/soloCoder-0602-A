export type UserRole = 'employee' | 'manager' | 'hr' | 'admin';

export interface Department {
  id: number;
  name: string;
  parent_id: number | null;
  description?: string;
  children?: Department[];
  employee_count?: number;
}

export interface Employee {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department_id?: number;
  department_name?: string;
  hire_date?: string;
  avatar?: string;
  role?: UserRole;
}

export interface EmployeeSearchResult {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department_name?: string;
  role?: string;
}

export interface ApiResponse<T> {
  total: number;
  items: T[];
}

export interface LoginRequest {
  name: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  employee: Employee;
}

export interface CurrentUser {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department_id?: number;
  department_name?: string;
  role: UserRole;
}

export interface PermissionConfig {
  canAddEmployee: boolean;
  canEditEmployee: boolean;
  canDeleteEmployee: boolean;
  canAddDepartment: boolean;
  canEditDepartment: boolean;
  canDeleteDepartment: boolean;
  canImport: boolean;
  canExport: boolean;
}
