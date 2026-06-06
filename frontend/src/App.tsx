import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Button, message, Modal, Form, Input, Upload, DatePicker, Select } from 'antd';
import {
  TeamOutlined,
  UserAddOutlined,
  ImportOutlined,
  ExportOutlined,
  SearchOutlined,
  ApartmentOutlined
} from '@ant-design/icons';
import DepartmentTree from './components/DepartmentTree';
import EmployeeTable from './components/EmployeeTable';
import EmployeeDetail from './components/EmployeeDetail';
import { Department, Employee } from './types';
import { departmentApi, employeeApi } from './services/api';
import dayjs from 'dayjs';

const { Header, Content } = Layout;

const App: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<number | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [deptModalVisible, setDeptModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [deptForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [deptOptions, setDeptOptions] = useState<{ label: string; value: number }[]>([]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await departmentApi.getAll();
      setDepartments(res.data);
      const options: { label: string; value: number }[] = [];
      const flatten = (items: Department[]) => {
        items.forEach(item => {
          options.push({ label: item.name, value: item.id });
          if (item.children && item.children.length > 0) {
            flatten(item.children);
          }
        });
      };
      flatten(res.data);
      setDeptOptions(options);
    } catch (error) {
      message.error('加载部门数据失败');
    }
  }, []);

  useEffect(() => {
    loadDepartments();
  }, [loadDepartments]);

  const handleDeptSelect = (deptId: number | null) => {
    setSelectedDept(deptId);
    setSelectedEmployee(null);
  };

  const handleEmployeeClick = (emp: Employee) => {
    setSelectedEmployee(emp);
  };

  const handleAddEmployee = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const data = {
        ...values,
        hire_date: values.hire_date ? values.hire_date.format('YYYY-MM-DD') : undefined
      };
      await employeeApi.create(data);
      message.success('添加成功');
      setAddModalVisible(false);
      form.resetFields();
      setSelectedEmployee(null);
      setSelectedDept(selectedDept);
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('添加失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDepartment = async () => {
    try {
      const values = await deptForm.validateFields();
      setLoading(true);
      await departmentApi.create(values);
      message.success('添加部门成功');
      setDeptModalVisible(false);
      deptForm.resetFields();
      loadDepartments();
    } catch (error: any) {
      if (error.errorFields) return;
      message.error('添加部门失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await employeeApi.export();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', '员工通讯录.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  const handleImport = async (info: any) => {
    const { file } = info;
    if (file.status === 'done') {
      try {
        const res = await employeeApi.import(file.originFileObj as File);
        if (res.data.success) {
          message.success(res.data.message);
          setSelectedDept(selectedDept);
        } else {
          message.error(res.data.message);
        }
      } catch (error: any) {
        message.error(error.response?.data?.detail || '导入失败');
      }
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="app-header">
        <div className="logo">
          <ApartmentOutlined style={{ fontSize: 24 }} />
          企业通讯录管理系统
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddModalVisible(true)}>
            添加员工
          </Button>
          <Button icon={<TeamOutlined />} onClick={() => setDeptModalVisible(true)}>
            添加部门
          </Button>
          <Upload
            showUploadList={false}
            beforeUpload={() => false}
            onChange={handleImport}
            accept=".xlsx,.xls"
          >
            <Button icon={<ImportOutlined />}>导入Excel</Button>
          </Upload>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            导出Excel
          </Button>
        </div>
      </Header>
      <Content className="app-content">
        <div className="main-layout">
          <div className="tree-panel">
            <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 16 }}>
              <ApartmentOutlined style={{ marginRight: 8 }} />
              组织架构
            </div>
            <DepartmentTree
              departments={departments}
              selectedDept={selectedDept}
              onSelect={handleDeptSelect}
            />
          </div>
          <div className="content-panel">
            <div className="search-bar">
              <Input.Search
                className="search-input"
                placeholder="搜索员工姓名、邮箱、电话、职位..."
                allowClear
                size="large"
                prefix={<SearchOutlined />}
                onSearch={(value) => setSearchKeyword(value)}
                onChange={(e) => !e.target.value && setSearchKeyword('')}
              />
            </div>
            {selectedEmployee ? (
              <EmployeeDetail
                employee={selectedEmployee}
                deptOptions={deptOptions}
                onBack={() => setSelectedEmployee(null)}
                onUpdated={() => {
                  setSelectedEmployee(null);
                }}
                onDeleted={() => {
                  setSelectedEmployee(null);
                }}
              />
            ) : (
              <EmployeeTable
                departmentId={selectedDept}
                searchKeyword={searchKeyword}
                onEmployeeClick={handleEmployeeClick}
              />
            )}
          </div>
        </div>
      </Content>

      <Modal
        title="添加员工"
        open={addModalVisible}
        onOk={handleAddEmployee}
        onCancel={() => {
          setAddModalVisible(false);
          form.resetFields();
        }}
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

      <Modal
        title="添加部门"
        open={deptModalVisible}
        onOk={handleAddDepartment}
        onCancel={() => {
          setDeptModalVisible(false);
          deptForm.resetFields();
        }}
        confirmLoading={loading}
      >
        <Form form={deptForm} layout="vertical">
          <Form.Item
            name="name"
            label="部门名称"
            rules={[{ required: true, message: '请输入部门名称' }]}
          >
            <Input placeholder="请输入部门名称" />
          </Form.Item>
          <Form.Item name="parent_id" label="上级部门">
            <Select
              placeholder="请选择上级部门（不选为顶级部门）"
              options={deptOptions}
              allowClear
            />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="请输入部门描述" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
};

export default App;
