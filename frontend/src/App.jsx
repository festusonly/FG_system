import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import StaffPortal from './pages/StaffPortal'
import KitchenPortal from './pages/KitchenPortal'
import AdminDashboard from './pages/AdminDashboard'
import './styles/index.css'

// Protected route — only waits for loading on protected pages, not the login page
function ProtectedRoute({ children, requiredRole = null }) {
  const { user, role, loading } = useAuth()

  // Still initialising — wait briefly only on protected routes
  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', color: 'var(--text-secondary)', fontFamily: 'inherit'
      }}>
        Loading...
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && role !== requiredRole) {
    if (role === 'admin') return <Navigate to="/admin" replace />
    if (role === 'kitchen') return <Navigate to="/kitchen" replace />
    return <Navigate to="/staff" replace />
  }

  return children
}

export default function App() {
  const { user } = useAuth()
  // No loading block here — login page shows instantly

  return (
    <Routes>
      {/* Public route — always renders immediately */}
      <Route path="/login" element={<Login />} />

      {/* Staff portal */}
      <Route
        path="/staff"
        element={
          <ProtectedRoute requiredRole="worker">
            <StaffPortal />
          </ProtectedRoute>
        }
      />

      {/* Kitchen portal */}
      <Route
        path="/kitchen"
        element={
          <ProtectedRoute requiredRole="kitchen">
            <KitchenPortal />
          </ProtectedRoute>
        }
      />

      {/* Admin dashboard */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      {/* Smart redirect after login */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />

      {/* Root: go to login, not dashboard (avoids blocking) */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 404 fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

// Smart dashboard that redirects based on role
function Dashboard() {
  const { role } = useAuth()

  if (role === 'admin') return <Navigate to="/admin" replace />
  if (role === 'kitchen') return <Navigate to="/kitchen" replace />
  if (role === 'worker') return <Navigate to="/staff" replace />
  return <Navigate to="/login" replace />
}

