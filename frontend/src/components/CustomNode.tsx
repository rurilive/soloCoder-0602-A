import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Tooltip } from 'antd'
import { ExperimentOutlined, FilterOutlined } from '@ant-design/icons'
import type { DAGNode as DAGNodeType } from '../types'

interface CustomNodeData {
  label: string
  scriptType: string
  nodeId: number
  conditionExpression?: string
  exposeOutputVars?: boolean
}

const CustomNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => {
  const hasCondition = !!data.conditionExpression
  const hasVars = !!data.exposeOutputVars

  return (
    <div
      className={`custom-node ${data.scriptType} ${selected ? 'selected' : ''}`}
      style={{
        border: selected ? '3px solid #ffd700' : undefined,
        minWidth: 140
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{data.label}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {hasCondition && (
            <Tooltip title={`条件: ${data.conditionExpression}`}>
              <FilterOutlined style={{ color: '#faad14', fontSize: 12 }} />
            </Tooltip>
          )}
          {hasVars && (
            <Tooltip title="暴露输出变量">
              <ExperimentOutlined style={{ color: '#1890ff', fontSize: 12 }} />
            </Tooltip>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
        {data.scriptType.toUpperCase()}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})

CustomNode.displayName = 'CustomNode'

export default CustomNode
