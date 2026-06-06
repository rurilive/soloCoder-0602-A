import { Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import NewProject from './pages/NewProject.jsx'
import BuildDetail from './pages/BuildDetail.jsx'

function App() {
  return (
    <div className="container">
      <div className="header">
        <h1>CI/CD 可视化面板</h1>
      </div>
      <nav className="nav">
        <Link to="/">项目列表</Link>
        <Link to="/projects/new">新建项目</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/projects/new" element={<NewProject />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/builds/:buildId" element={<BuildDetail />} />
      </Routes>
    </div>
  )
}

export default App
