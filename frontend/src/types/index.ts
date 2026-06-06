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
}

export interface EmployeeSearchResult {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  department_name?: string;
}

export interface ApiResponse<T> {
  total: number;
  items: T[];
}
