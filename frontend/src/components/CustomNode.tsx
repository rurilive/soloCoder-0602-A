import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { DAGNode as DAGNodeType } from '../types'

interface CustomNodeData {
  label: string
  scriptType: string
  nodeId: number
}

const CustomNode = memo(({ data, selected }: NodeProps<CustomNodeData>) => {
  return (
    <div
      className={`custom-node ${data.scriptType} ${selected ? 'selected' : ''}`}
      style={{
        border: selected ? '3px solid #ffd700' : undefined
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 600, fontSize: 14 }}>{data.label}</div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4 }}>
        {data.scriptType.toUpperCase()}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  )
})

CustomNode.displayName = 'CustomNode'

export default CustomNode
