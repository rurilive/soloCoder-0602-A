import React from 'react';
import { Tree } from 'antd';
import { TeamOutlined, FolderOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { Department } from '../types';

interface DepartmentTreeProps {
  departments: Department[];
  selectedDept: number | null;
  onSelect: (deptId: number | null) => void;
}

const buildTreeData = (depts: Department[]): any[] => {
  return depts.map(dept => ({
    key: dept.id,
    title: (
      <div className="tree-node-title">
        <span>{dept.name}</span>
        <span className="count">{dept.employee_count || 0}</span>
      </div>
    ),
    icon: <TeamOutlined />,
    children: dept.children && dept.children.length > 0 ? buildTreeData(dept.children) : []
  }));
};

const DepartmentTree: React.FC<DepartmentTreeProps> = ({ departments, selectedDept, onSelect }) => {
  const treeData = [
    {
      key: 'all',
      title: (
        <div className="tree-node-title">
          <span>全部员工</span>
        </div>
      ),
      icon: <TeamOutlined />,
      children: buildTreeData(departments)
    }
  ];

  const handleSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) {
      onSelect(null);
      return;
    }
    const key = selectedKeys[0];
    if (key === 'all') {
      onSelect(null);
    } else {
      onSelect(Number(key));
    }
  };

  return (
    <Tree
      showIcon
      defaultExpandAll
      treeData={treeData}
      selectedKeys={selectedDept ? [selectedDept] : ['all']}
      onSelect={handleSelect}
      icon={({ expanded }) =>
        expanded ? <FolderOpenOutlined style={{ color: '#1890ff' }} /> : <FolderOutlined style={{ color: '#1890ff' }} />
      }
      blockNode
    />
  );
};

export default DepartmentTree;
