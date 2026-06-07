import React, { useState } from 'react';
import { Card, Button, Space, Descriptions, Tag, Modal, Form, Input, DatePicker, Select, message, Popconfirm } from 'antd';
import {
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  MailOutlined,
  PhoneOutlined,
  TeamOutlined,
  UserOutlined,
  CalendarOutlined,
  SafetyOutlined
} from '@ant-design/icons';
import { Employee, PermissionConfig } from '../types';
import { employeeApi } from '../services/api';
import { getRoleName } from '../utils/permissions';
import dayjs from 'dayjs';

interface EmployeeDetailProps {
  employee: Employee;
  deptOptions: { label: string; value: number }[];
  onBack: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
  permissions: PermissionConfig;
}

const roleColors: Record<string, string> = {
  admin: 'red',
  hr: 'purple',
  manager: 'orange',
  employee: 'blue'
};

const EmployeeDetail: React.FC<EmployeeDetailProps> = ({ employee, deptOptions, onBack, onUpdated, onDeleted, permissions }) => {
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleEdit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const data = {
        ...values,
        hire_date: values.hire_date ? values.hire_date.format('YYYY-MM-DD') : undefined
      };
      await employeeApi.update(employee.id, data);
      message.success('更新成功');
      setEditModalVisible(false);
      onUpdated();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('更新失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await employeeApi.delete(employee.id);
      message.success('删除成功');
      onDeleted();
    } catch (error) {
      message.error('删除失败');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
          返回列表
        </Button>
        <Space>
          {permissions.canEditEmployee && (
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  ...employee,
                  hire_date: employee.hire_date ? dayjs(employee.hire_date) : undefined
                });
                setEditModalVisible(true);
              }}
            >
              编辑
            </Button>
          )}
          {permissions.canDeleteEmployee && (
            <Popconfirm
              title="确定删除该员工吗？"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 24 }}>
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1890ff, #0050b3)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 600
            }}
          >
            {employee.name.charAt(0)}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
              {employee.name}
              {employee.role && (
                <Tag color={roleColors[employee.role]} icon={<SafetyOutlined />}>
                  {getRoleName(employee.role)}
                </Tag>
              )}
            </h2>
            <p style={{ margin: '8px 0 0 0', color: '#8c8c8c', fontSize: 16 }}>
              {employee.position || '未设置职位'}
            </p>
          </div>
        </div>

        <Descriptions bordered column={2}>
          <Descriptions.Item label="姓名" span={1}>
            <Space>
              <UserOutlined style={{ color: '#1890ff' }} />
              {employee.name}
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="部门" span={1}>
            <Tag color="blue" icon={<TeamOutlined />}>
              {employee.department_name || '未分配'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="邮箱" span={1}>
            {employee.email ? (
              <Space>
                <MailOutlined style={{ color: '#1890ff' }} />
                <a href={`mailto:${employee.email}`}>{employee.email}</a>
              </Space>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="电话" span={1}>
            {employee.phone ? (
              <Space>
                <PhoneOutlined style={{ color: '#52c41a' }} />
                <a href={`tel:${employee.phone}`}>{employee.phone}</a>
              </Space>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="角色" span={1}>
            {employee.role ? (
              <Tag color={roleColors[employee.role]} icon={<SafetyOutlined />}>
                {getRoleName(employee.role)}
              </Tag>
            ) : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="入职日期" span={1}>
            <Space>
              <CalendarOutlined style={{ color: '#722ed1' }} />
              {employee.hire_date || '—'}
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title="编辑员工"
        open={editModalVisible}
        onOk={handleEdit}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={loading}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="email" label="邮箱">
              <Input placeholder="请输入邮箱" />
            </Form.Item>
            <Form.Item name="phone" label="电话">
              <Input placeholder="请输入电话" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="position" label="职位">
              <Input placeholder="请输入职位" />
            </Form.Item>
            <Form.Item name="department_id" label="部门">
              <Select
                placeholder="请选择部门"
                options={deptOptions}
                allowClear
              />
            </Form.Item>
          </div>
          <Form.Item name="hire_date" label="入职日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeeDetail;
