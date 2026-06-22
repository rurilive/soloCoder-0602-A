import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  MarkerType,
  useReactFlow,
  BackgroundVariant
} from 'reactflow'
import {
  Button,
  Space,
  Form,
  Input,
  Select,
  Card,
  message,
  Popconfirm,
  Row,
  Col,
  Tag
} from 'antd'
import {
  SaveOutlined,
  PlayCircleOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CodeOutlined
} from '@ant-design/icons'
import CustomNode from '../components/CustomNode'
import { dagApi, nodeApi, edgeApi } from '../api'
import type { DAG, DAGNode, DAGEdge } from '../types'

const nodeTypes = {
  custom: CustomNode
}

const defaultScriptTemplates = {
  shell: '#!/bin/bash\necho "Hello from Shell"\necho "Current date: $(date)"',
  python: 'print("Hello from Python")\nimport datetime\nprint(f"Current date: {datetime.datetime.now()}")'
}

const DAGEditor = () => {
  const { id } = useParams<{ id: string }>()
  const dagId = Number(id)
  const navigate = useNavigate()
  const [form] = Form.useForm()

  const [dag, setDag] = useState<DAG | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [loading, setLoading] = useState(false)
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useReactFlow()

  const loadDAG = useCallback(async () => {
    try {
      setLoading(true)
      const res = await dagApi.get(dagId)
      const dagData = res.data
      setDag(dagData)

      const rfNodes: Node[] = dagData.nodes.map((node) => ({
        id: node.id.toString(),
        type: 'custom',
        position: { x: node.position_x, y: node.position_y },
        data: {
          label: node.name,
          scriptType: node.script_type,
          scriptContent: node.script_content,
          nodeId: node.id
        }
      }))
      setNodes(rfNodes)

      const rfEdges: Edge[] = dagData.edges.map((edge) => ({
        id: edge.id.toString(),
        source: edge.source_node_id.toString(),
        target: edge.target_node_id.toString(),
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed
        },
        style: { stroke: '#1890ff', strokeWidth: 2 }
      }))
      setEdges(rfEdges)
    } catch (error) {
      message.error('加载 DAG 失败')
    } finally {
      setLoading(false)
    }
  }, [dagId])

  useEffect(() => {
    if (dagId) {
      loadDAG()
    }
  }, [dagId, loadDAG])

  useEffect(() => {
    if (selectedNode) {
      const node = dag?.nodes.find((n) => n.id === Number(selectedNode.id))
      if (node) {
        form.setFieldsValue({
          name: node.name,
          script_type: node.script_type,
          script_content: node.script_content
        })
      }
    }
  }, [selectedNode, dag, form])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  const onConnect = useCallback((connection: Connection) => {
    setEdges((eds) => addEdge({
      ...connection,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { stroke: '#1890ff', strokeWidth: 2 }
    }, eds))
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()

    const type = event.dataTransfer.getData('application/reactflow')
    if (!type || !reactFlowWrapper.current) return

    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top
    })

    const newNodeId = `temp_${Date.now()}`
    const scriptType = type as 'shell' | 'python'
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position,
      data: {
        label: `新建${type.toUpperCase()}节点`,
        scriptType: type,
        scriptContent: defaultScriptTemplates[scriptType],
        nodeId: 0
      }
    }

    setNodes((nds) => nds.concat(newNode))
    setSelectedNode(newNode)
  }, [reactFlowInstance])

  const handleAddNode = async (scriptType: 'shell' | 'python') => {
    if (!dag) return

    try {
      const position = { x: 100 + nodes.length * 50, y: 100 + nodes.length * 50 }
      const res = await nodeApi.create(dagId, {
        name: `新建${scriptType.toUpperCase()}节点`,
        script_type: scriptType,
        script_content: defaultScriptTemplates[scriptType],
        position_x: position.x,
        position_y: position.y
      })

      const newNode: Node = {
        id: res.data.id.toString(),
        type: 'custom',
        position,
        data: {
          label: res.data.name,
          scriptType: res.data.script_type,
          nodeId: res.data.id
        }
      }

      setNodes((nds) => nds.concat(newNode))
      setSelectedNode(newNode)
      message.success('节点已添加')
    } catch (error) {
      message.error('添加节点失败')
    }
  }

  const handleDeleteNode = async () => {
    if (!selectedNode) return

    try {
      const nodeId = Number(selectedNode.id)
      if (!isNaN(nodeId) && nodeId > 0) {
        await nodeApi.delete(dagId, nodeId)
      }

      setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id))
      setEdges((eds) => eds.filter(
        (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
      ))
      setSelectedNode(null)
      message.success('节点已删除')
    } catch (error) {
      message.error('删除节点失败')
    }
  }

  const handleUpdateNode = async (values: any) => {
    if (!selectedNode) return

    try {
      const nodeId = Number(selectedNode.id)
      if (isNaN(nodeId) || nodeId <= 0) {
        const position = selectedNode.position
        const res = await nodeApi.create(dagId, {
          name: values.name,
          script_type: values.script_type,
          script_content: values.script_content,
          position_x: position.x,
          position_y: position.y
        })

        setNodes((nds) => nds.map((n) => {
          if (n.id === selectedNode.id) {
            return {
              ...n,
              id: res.data.id.toString(),
              data: {
                ...n.data,
                label: values.name,
                scriptType: values.script_type,
                scriptContent: values.script_content,
                nodeId: res.data.id
              }
            }
          }
          return n
        }))
        setSelectedNode(null)
        message.success('节点已保存')
        return
      }

      await nodeApi.update(dagId, nodeId, values)

      setNodes((nds) => nds.map((n) => {
        if (n.id === selectedNode.id) {
          return {
            ...n,
            data: {
              ...n.data,
              label: values.name,
              scriptType: values.script_type,
              scriptContent: values.script_content
            }
          }
        }
        return n
      }))

      message.success('节点已更新')
    } catch (error) {
      message.error('保存失败')
    }
  }

  const handleSave = async () => {
    try {
      let updatedNodes = [...nodes]
      let updatedEdges = [...edges]
      const idMapping: Record<string, string> = {}

      if (selectedNode) {
        const values = form.getFieldsValue()
        if (values.name !== undefined) {
          updatedNodes = updatedNodes.map((n) => {
            if (n.id === selectedNode.id) {
              return {
                ...n,
                data: {
                  ...n.data,
                  label: values.name,
                  scriptType: values.script_type || n.data.scriptType,
                  scriptContent: values.script_content ?? n.data.scriptContent
                }
              }
            }
            return n
          })
        }
      }

      const tempNodes = updatedNodes.filter((n) => {
        const nodeId = n.id
        return nodeId.startsWith('temp_') || (n.data.nodeId ?? 0) <= 0
      })

      for (const tempNode of tempNodes) {
        const scriptType = tempNode.data.scriptType as 'shell' | 'python'
        const scriptContent = tempNode.data.scriptContent || defaultScriptTemplates[scriptType]

        const res = await nodeApi.create(dagId, {
          name: tempNode.data.label,
          script_type: scriptType,
          script_content: scriptContent,
          position_x: tempNode.position.x,
          position_y: tempNode.position.y
        })

        const newId = res.data.id.toString()
        idMapping[tempNode.id] = newId

        updatedNodes = updatedNodes.map((n) => {
          if (n.id === tempNode.id) {
            return {
              ...n,
              id: newId,
              data: {
                ...n.data,
                nodeId: res.data.id
              }
            }
          }
          return n
        })

        updatedEdges = updatedEdges.map((e) => {
          let newEdge = { ...e }
          if (e.source === tempNode.id) {
            newEdge.source = newId
          }
          if (e.target === tempNode.id) {
            newEdge.target = newId
          }
          return newEdge
        })
      }

      if (tempNodes.length > 0) {
        setNodes(updatedNodes)
        setEdges(updatedEdges)
      }

      for (const node of updatedNodes) {
        const nodeId = Number(node.id)
        if (!isNaN(nodeId) && nodeId > 0) {
          const scriptType = node.data.scriptType as 'shell' | 'python'
          const scriptContent = node.data.scriptContent || defaultScriptTemplates[scriptType]
          await nodeApi.update(dagId, nodeId, {
            name: node.data.label,
            script_type: scriptType,
            script_content: scriptContent,
            position_x: node.position.x,
            position_y: node.position.y
          })
        }
      }

      const edgeData = updatedEdges
        .filter((e) => {
          const sourceId = Number(e.source)
          const targetId = Number(e.target)
          return !isNaN(sourceId) && !isNaN(targetId) && sourceId > 0 && targetId > 0
        })
        .map((e) => ({
          source_node_id: Number(e.source),
          target_node_id: Number(e.target)
        }))

      await edgeApi.batchSync(dagId, edgeData)

      message.success('DAG 已保存')
    } catch (error) {
      message.error('保存失败')
    }
  }

  const handleTrigger = async () => {
    try {
      await dagApi.trigger(dagId)
      message.success('已触发执行，跳转到执行历史...')
      setTimeout(() => {
        navigate(`/dags/${dagId}/executions`)
      }, 1000)
    } catch (error) {
      message.error('触发失败')
    }
  }

  const handleDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  if (!dag) {
    return <div style={{ padding: 24 }}>加载中...</div>
  }

  return (
    <div>
      <div className="page-header">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/dags')}>
            返回
          </Button>
          <h2 style={{ margin: 0 }}>
            {dag.name}
            <Tag color={dag.is_active ? 'green' : 'default'} style={{ marginLeft: 12 }}>
              {dag.is_active ? '调度运行中' : '调度已停止'}
            </Tag>
          </h2>
        </Space>
        <Space>
          <Button icon={<SaveOutlined />} onClick={handleSave}>
            保存
          </Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleTrigger}>
            立即执行
          </Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={4}>
          <div className="node-panel">
            <h4 style={{ marginBottom: 12 }}>添加节点</h4>
            <div
              className="node-card"
              draggable
              onDragStart={(e) => handleDragStart(e, 'shell')}
              onClick={() => handleAddNode('shell')}
            >
              <CodeOutlined style={{ marginRight: 8 }} />
              Shell 节点
            </div>
            <div
              className="node-card"
              draggable
              onDragStart={(e) => handleDragStart(e, 'python')}
              onClick={() => handleAddNode('python')}
            >
              <CodeOutlined style={{ marginRight: 8 }} />
              Python 节点
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
              提示：拖拽节点到画布，或点击直接添加
            </div>
          </div>

          {selectedNode && (
            <div className="node-config">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <h4 style={{ margin: 0 }}>节点配置</h4>
                <Popconfirm title="确定删除该节点?" onConfirm={handleDeleteNode}>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              </div>
              <Form
                form={form}
                layout="vertical"
                onFinish={handleUpdateNode}
              >
                <Form.Item name="name" label="节点名称" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="script_type" label="脚本类型" rules={[{ required: true }]}>
                  <Select>
                    <Select.Option value="shell">Shell</Select.Option>
                    <Select.Option value="python">Python</Select.Option>
                  </Select>
                </Form.Item>
                <Form.Item name="script_content" label="脚本内容" rules={[{ required: true }]}>
                  <Input.TextArea
                    rows={12}
                    font-family="'Fira Code', monospace"
                    placeholder="输入脚本内容..."
                  />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" block>
                    保存节点
                  </Button>
                </Form.Item>
              </Form>
            </div>
          )}
        </Col>

        <Col span={20}>
          <div ref={reactFlowWrapper} className="dag-canvas">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Controls />
              <MiniMap
                pannable
                zoomable
                nodeColor={(n) => {
                  if (n.data.scriptType === 'python') return '#3776ab'
                  return '#4eaa25'
                }}
              />
            </ReactFlow>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#999', textAlign: 'center' }}>
            拖拽节点到画布 | 点击节点底部连接点拖动到另一个节点顶部可创建连线 | 点击节点编辑属性 | 点击保存按钮保存修改
          </div>
        </Col>
      </Row>
    </div>
  )
}

export default DAGEditor
