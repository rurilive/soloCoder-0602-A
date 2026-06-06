import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from 'antd'
import Login from './pages/Login'
import TeacherLayout from './components/TeacherLayout'
import StudentLayout from './components/StudentLayout'
import QuestionBank from './pages/teacher/QuestionBank'
import ExamCreate from './pages/teacher/ExamCreate'
import ExamList from './pages/teacher/ExamList'
import ExamDetail from './pages/teacher/ExamDetail'
import StudentExamList from './pages/student/StudentExamList'
import ExamPage from './pages/student/ExamPage'
import ExamResult from './pages/student/ExamResult'

const { Content } = Layout

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/teacher" element={<TeacherLayout />}>
        <Route index element={<Navigate to="questions" replace />} />
        <Route path="questions" element={<QuestionBank />} />
        <Route path="exams" element={<ExamList />} />
        <Route path="exams/create" element={<ExamCreate />} />
        <Route path="exams/:id" element={<ExamDetail />} />
      </Route>
      
      <Route path="/student" element={<StudentLayout />}>
        <Route index element={<Navigate to="exams" replace />} />
        <Route path="exams" element={<StudentExamList />} />
        <Route path="exams/:id" element={<ExamPage />} />
        <Route path="exams/:id/result" element={<ExamResult />} />
      </Route>
      
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
