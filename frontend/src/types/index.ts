export interface User {
  id: number
  username: string
  is_active: boolean
  created_at: string
}

export interface Token {
  access_token: string
  token_type: string
}

export interface DAGNode {
  id: number
  dag_id: number
  name: string
  script_type: 'shell' | 'python'
  script_content: string
  position_x: number
  position_y: number
  created_at: string
  updated_at: string
}

export interface DAGEdge {
  id: number
  dag_id: number
  source_node_id: number
  target_node_id: number
  created_at: string
}

export interface DAG {
  id: number
  name: string
  description: string
  cron_expression: string
  is_active: boolean
  owner_id: number
  created_at: string
  updated_at: string
  nodes: DAGNode[]
  edges: DAGEdge[]
}

export interface NodeExecution {
  id: number
  task_execution_id: number
  node_id: number
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped'
  started_at: string | null
  finished_at: string | null
  log: string
}

export interface TaskExecution {
  id: number
  dag_id: number
  status: 'pending' | 'running' | 'success' | 'failed'
  started_at: string | null
  finished_at: string | null
  created_at: string
  node_executions: NodeExecution[]
}

export interface LogEntry {
  node_id: number
  node_name: string
  message: string
  timestamp: string
  level: 'info' | 'error' | 'success'
}
