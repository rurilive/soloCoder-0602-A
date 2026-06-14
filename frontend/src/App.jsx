import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import Section from './pages/Section'
import PostDetail from './pages/PostDetail'
import CreatePost from './pages/CreatePost'
import EditPost from './pages/EditPost'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Search from './pages/Search'
import Notifications from './pages/Notifications'
import ChatList from './pages/ChatList'
import ChatConversation from './pages/ChatConversation'
import ReviewCenter from './pages/ReviewCenter'

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <span>加载中...</span>
      </div>
    )
  }
  return isAuthenticated ? children : <Navigate to="/login" />
}

function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth()
  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <span>加载中...</span>
      </div>
    )
  }
  return isAdmin ? children : <Navigate to="/" />
}

function ModeratorRoute({ children }) {
  const { isModerator, loading } = useAuth()
  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <span>加载中...</span>
      </div>
    )
  }
  return isModerator ? children : <Navigate to="/" />
}

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/search" element={<Search />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/section/:id" element={<Section />} />
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/post/new/:sectionId" element={<PrivateRoute><CreatePost /></PrivateRoute>} />
          <Route path="/post/:id/edit" element={<PrivateRoute><EditPost /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
          <Route path="/notifications" element={<PrivateRoute><Notifications /></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><ChatList /></PrivateRoute>} />
          <Route path="/chat/:id" element={<PrivateRoute><ChatConversation /></PrivateRoute>} />
          <Route path="/review-center" element={<ModeratorRoute><ReviewCenter /></ModeratorRoute>} />
          <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
        </Routes>
      </main>
    </>
  )
}
