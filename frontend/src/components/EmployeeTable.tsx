import React, { useState, useEffect } from 'react';
import { Table, Space, Tag, message } from 'antd';
import { UserOutlined, MailOutlined, PhoneOutlined, TeamOutlined } from '@ant-design/icons';
import { Employee } from '../types';
import { employeeApi } from '../services/api';

interface EmployeeTableProps {
  departmentId: number | null;
  searchKeyword: string;
  onEmployeeClick: (emp: Employee) => void;
}

const EmployeeTable: React.FC<EmployeeTableProps> = ({ departmentId, searchKeyword, onEmployeeClick }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const params: any = {
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize
      };
      if (departmentId !== null) {
        params.department_id = departmentId;
      }
      if (searchKeyword) {
        params.search = searchKeyword;
      }
      const res = await employeeApi.getAll(params);
      setEmployees(res.data.items);
      setTotal(res.data.total);
    } catch (error) {
      message.error('加载员工数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPagination(prev => ({ ...prev, current: 1 }));
  }, [departmentId, searchKeyword]);

  useEffect(() => {
    loadEmployees();
  }, [departmentId, searchKeyword, pagination.current, pagination.pageSize]);

  const columns = [
    {
      title: '员工信息',
      key: 'name',
      render: (_: any, record: Employee) => (
        <div className="employee-avatar">
          <div className="avatar">
            {record.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 500 }}>{record.name}</div>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              {record.position || '—'}
            </div>
          </div>
        </div>
      )
    },
    {
      title: '部门',
      dataIndex: 'department_name',
      key: 'department_name',
      render: (text: string) => (
        <Tag color="blue" icon={<TeamOutlined />}>
          {text || '未分配'}
        </Tag>
      )
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (text: string) => text ? (
        <Space>
          <MailOutlined style={{ color: '#1890ff' }} />
          <a href={`mailto:${text}`}>{text}</a>
        </Space>
      ) : '—'
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      render: (text: string) => text ? (
        <Space>
          <PhoneOutlined style={{ color: '#52c41a' }} />
          <a href={`tel:${text}`}>{text}</a>
        </Space>
      ) : '—'
    },
    {
      title: '入职日期',
      dataIndex: 'hire_date',
      key: 'hire_date',
      render: (text: string) => text || '—'
    }
  ];

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={employees}
      loading={loading}
      pagination={{
        ...pagination,
        total,
        showSizeChanger: true,
        showTotal: (total) => `共 ${total} 条记录`
      }}
      onRow={(record) => ({
        onClick: () => onEmployeeClick(record),
        style: { cursor: 'pointer' }
      })}
      rowHoverable
    />
  );
};

export default EmployeeTable;
