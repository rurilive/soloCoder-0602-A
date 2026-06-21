import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { ReactFlowProvider } from 'reactflow'
import App from './App'
import { useAuthStore } from './store/auth'
import 'reactflow/dist/style.css'
import './index.css'

useAuthStore.getState().init()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6
        }
      }}
    >
      <ReactFlowProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ReactFlowProvider>
    </ConfigProvider>
  </React.StrictMode>
)
