import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/AdminDashboard.css'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { rooms, transactions, expenses } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'

  // Computed Metrics
  const totalToday = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netRevenue = totalToday - totalExpenses
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length
  const availableRooms = rooms.length - occupiedRooms

  const activeTransactions = transactions.filter(tx => tx.status === 'active')
  const shortStayCount = activeTransactions.filter(tx => tx.type === 'short_hours').length
  const nightStayCount = activeTransactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length

  const displayedRooms = rooms.filter(r => roomFilter === 'all' || r.status === roomFilter)

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleRoomFilter = (type) => {
    setRoomFilter(prev => prev === type ? 'all' : type)
    scrollToSection('room-utilization-section')
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="header-left">
          <h1>Admin Dashboard</h1>
          <p>Owner: {user?.email}</p>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="dashboard-content">
        {/* Live Metrics */}
        <div className="metrics-section">
          <div 
            className="metric-card primary clickable"
            onClick={() => scrollToSection('transactions-section')}
          >
            <h3>Net Revenue</h3>
            <p className="metric-value">RWF {netRevenue.toLocaleString()}</p>
            <span className="metric-label">Total Cash - Expenses</span>
          </div>

          <div 
            className={`metric-card success clickable ${roomFilter === 'available' ? 'active-filter' : ''}`}
            onClick={() => handleRoomFilter('available')}
          >
            <h3>Available Rooms</h3>
            <p className="metric-value">{availableRooms}</p>
            <span className="metric-label">Ready for booking</span>
          </div>

          <div 
            className={`metric-card warning clickable ${roomFilter === 'occupied' ? 'active-filter' : ''}`}
            onClick={() => handleRoomFilter('occupied')}
          >
            <h3>Occupied Rooms</h3>
            <p className="metric-value">{occupiedRooms}</p>
            <span className="metric-label">Currently in use</span>
          </div>

          <div className="metric-card info">
            <h3>Stay Breakdown</h3>
            <p className="metric-value breakdown-value">
              <span className="short-stay">{shortStayCount} Short</span>
              <span className="divider">/</span>
              <span className="night-stay">{nightStayCount} Night</span>
            </p>
            <span className="metric-label">Active bookings</span>
          </div>

          <div className="metric-card danger clickable" onClick={() => scrollToSection('expenses-section')}>
            <h3>Total Expenses</h3>
            <p className="metric-value">RWF {totalExpenses.toLocaleString()}</p>
            <span className="metric-label">Recorded outgoings</span>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Recent Transactions (Moved to main column) */}
          <div className="panel-section" id="transactions-section">
            <h2>Recent Transactions</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Amount</th>
                    <th>Type</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length > 0 ? (
                    transactions.slice(0, 5).map((tx) => (
                      <tr key={tx.id}>
                        <td className="room-cell">{tx.room}</td>
                        <td className="amount-cell text-success">
                          + RWF {tx.amount.toLocaleString()}
                        </td>
                        <td className="type-cell">
                          <span className="type-badge">
                            {tx.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="time-cell">{formatDate(tx.time)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        No transactions yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="right-panels">
            {/* Room Usage Table (Moved to right panels) */}
            <div className="panel-section" id="room-utilization-section">
              <h2>Room Utilization {roomFilter !== 'all' && `(${roomFilter})`}</h2>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Status</th>
                      <th>Usage Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRooms.map((room) => (
                      <tr key={room.id}>
                        <td className="room-cell">{room.name}</td>
                        <td>
                          <span className={`status-badge ${room.status}`}>
                            {room.status === 'occupied' ? 'Occupied' : 'Available'}
                          </span>
                        </td>
                        <td className="count-cell">{room.usageCount} times</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Expenses */}
            <div className="panel-section" id="expenses-section">
              <h2>Recent Expenses</h2>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Amount</th>
                      <th>Description</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length > 0 ? (
                      expenses.map((exp) => (
                        <tr key={exp.id}>
                          <td className="amount-cell text-danger">
                            - RWF {exp.amount.toLocaleString()}
                          </td>
                          <td className="desc-cell">{exp.description}</td>
                          <td className="time-cell">{formatDate(exp.time)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="empty-state">
                          No expenses recorded yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
