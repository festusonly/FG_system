import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/AdminDashboard.css'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { 
    rooms, 
    transactions, 
    expenses, 
    kitchenTransactions, 
    lastCollectionTime, 
    lastKitchenCollectionTime,
    collectCash,
    collectKitchenCash 
  } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'history', 'kitchen', 'settings'
  const [selectedDayDetails, setSelectedDayDetails] = useState(null)
  const [viewingExpense, setViewingExpense] = useState(null)
  const [showExpensesModal, setShowExpensesModal] = useState(false)
  const [showClientsModal, setShowClientsModal] = useState(false)
  const [showDailyClientsModal, setShowDailyClientsModal] = useState(false)

  const todayString = new Date().toDateString()
  
  // Filter out system events (markers) from real expenses
  const realExpenses = expenses.filter(exp => 
    exp.description !== 'SYSTEM_CASH_COLLECTION' && 
    exp.description !== 'KITCHEN_CASH_COLLECTION'
  )

  const todaysTransactions = transactions.filter(tx => new Date(tx.time).toDateString() === todayString)
  const todaysExpenses = realExpenses.filter(exp => new Date(exp.time).toDateString() === todayString)

  // Cash on Hand: all transactions since the last collection
  const cashOnHand = transactions
    .filter(tx => {
      const txTime = new Date(tx.time).getTime()
      const collTime = lastCollectionTime.getTime()
      // If no collection ever happened (collTime 0), show all.
      // Otherwise, show only transactions that happened AFTER the collection.
      // We subtract 1000ms from the transaction time to be more lenient with server clock jitter.
      return txTime > collTime
    })
    .reduce((sum, tx) => sum + tx.amount, 0)

  // Computed Metrics (Today Only)
  const totalToday = todaysTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = todaysExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netRevenue = totalToday - totalExpenses
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length
  const availableRooms = rooms.length - occupiedRooms

  const activeTransactions = todaysTransactions.filter(tx => tx.status === 'active')
  
  // Clients Since Collection: count of transactions since the last manual collection
  const shiftTransactions = transactions.filter(tx => {
    const txTime = new Date(tx.time).getTime()
    const collTime = lastCollectionTime.getTime()
    return txTime > collTime
  })
  
  const shortStayCount = activeTransactions.filter(tx => tx.type === 'short_hours').length
  const nightStayCount = activeTransactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length

  const displayedRooms = rooms
    .filter(r => roomFilter === 'all' || r.status === roomFilter)
    .sort((a, b) => {
      // Prioritize occupied rooms
      if (a.status === 'occupied' && b.status !== 'occupied') return -1
      if (a.status !== 'occupied' && b.status === 'occupied') return 1
      // Then sort numerically by roomNumber
      return parseInt(a.roomNumber) - parseInt(b.roomNumber)
    })

  const handleCollectCash = async () => {
    if (cashOnHand === 0) return alert('No cash to collect right now.')
    if (window.confirm(`Are you sure you want to collect RWF ${cashOnHand.toLocaleString()}? This will reset the Cash on Hand meter to zero.`)) {
      await collectCash()
    }
  }

  // History Helper
  const generateLast7DaysSummary = () => {
    const days = []
    // 0 is today, 1 is yesterday, etc.
    for (let i = 0; i < 7; i++) {
      const targetDate = new Date()
      targetDate.setDate(targetDate.getDate() - i)
      const dateString = targetDate.toDateString()

      const dayTx = transactions.filter(tx => new Date(tx.time).toDateString() === dateString)
      const dayExp = realExpenses.filter(exp => new Date(exp.time).toDateString() === dateString)

      const revenue = dayTx.reduce((sum, tx) => sum + tx.amount, 0)
      const expense = dayExp.reduce((sum, exp) => sum + exp.amount, 0)
      
      // Pass raw day transactions to calculate details later in the modal
      days.push({
        date: dateString,
        displayDate: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : targetDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        revenue,
        expense,
        net: revenue - expense,
        bookings: dayTx.length,
        transactions: dayTx
      })
    }
    return days
  }
  const historyData = generateLast7DaysSummary()

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

  const formatTime = (dateString) => {
    if (!dateString) return '--'
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getDuration = (start, end) => {
    if (!start || !end) return ''
    const diff = new Date(end) - new Date(start)
    if (diff < 0) return ''
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours === 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="header-left">
          <h1>Admin Dashboard</h1>
          <p>Owner: {user?.email}</p>
        </div>
        <div className="admin-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Live Overview
          </button>
          <button 
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            7-Day History
          </button>
          <button 
            className={`tab-btn ${activeTab === 'kitchen' ? 'active' : ''}`}
            onClick={() => setActiveTab('kitchen')}
          >
            Kitchen
          </button>
          <button 
            className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="dashboard-content">
        {activeTab === 'overview' && (
          <>
            {/* Cash Collection Banner */}
            <div className="cash-collection-banner">
              <div className="cash-info">
                <h3>Pending Cash on Hand</h3>
                <p>Collected since: {lastCollectionTime.getTime() === 0 ? 'Beginning' : lastCollectionTime.toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}</p>
              </div>
              <div className="cash-action">
                <span className="cash-amount">RWF {cashOnHand.toLocaleString()}</span>
                <button 
                  className="btn-collect" 
                  onClick={handleCollectCash}
                  disabled={cashOnHand === 0}
                >
                  Collect Cash
                </button>
              </div>
            </div>

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
            <h3>Total Clients Today</h3>
            <p className="metric-value">{todaysTransactions.length}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowDailyClientsModal(true)}
            >
              View Details
            </button>
          </div>

          <div className="metric-card info">
            <h3>Clients in Shift</h3>
            <p className="metric-value">{shiftTransactions.length}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowClientsModal(true)}
            >
              View Details
            </button>
          </div>

          <div className="metric-card primary">
            <h3>Stay Breakdown</h3>
            <p className="metric-value breakdown-value">
              <span className="short-stay">{shortStayCount} Short</span>
              <span className="divider">/</span>
              <span className="night-stay">{nightStayCount} Night</span>
            </p>
            <span className="metric-label">Active bookings</span>
          </div>

          <div className="metric-card danger">
            <h3>Total Expenses</h3>
            <p className="metric-value">RWF {totalExpenses.toLocaleString()}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowExpensesModal(true)}
            >
              View Details
            </button>
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
                  {todaysTransactions.length > 0 ? (
                    todaysTransactions.slice(0, 5).map((tx) => (
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
                        <td className="time-cell">{formatTime(tx.time)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-state">
                        No transactions today
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
                    {displayedRooms.map((room) => {
                      const todayUsage = todaysTransactions.filter(tx => tx.roomId === room.id).length
                      return (
                        <tr key={room.id}>
                          <td className="room-cell">{room.name}</td>
                          <td>
                            <span className={`status-badge ${room.status}`}>
                              {room.status === 'occupied' ? 'Occupied' : 'Available'}
                            </span>
                          </td>
                          <td className="count-cell">{todayUsage} times today</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>


          </div>
        </div>
          </>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <h2>7-Day Performance History</h2>
            <div className="history-grid">
              {historyData.map((day) => (
                <div key={day.date} className="history-card">
                  <div className="history-date">
                    <h3>{day.displayDate}</h3>
                    <span className="history-bookings">{day.bookings} bookings</span>
                  </div>
                  <div className="history-metrics">
                    <div className="history-metric text-success">
                      <span>Revenue</span>
                      <strong>RWF {day.revenue.toLocaleString()}</strong>
                    </div>
                    <div className="history-metric text-danger">
                      <span>Expenses</span>
                      <strong>RWF {day.expense.toLocaleString()}</strong>
                    </div>
                    <div className={`history-metric ${day.net >= 0 ? 'text-primary' : 'text-danger'}`}>
                      <span>Net Profit</span>
                      <strong>RWF {day.net.toLocaleString()}</strong>
                    </div>
                  </div>
                  
                  <button className="btn-details" onClick={() => setSelectedDayDetails(day)}>
                    View Details
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {activeTab === 'kitchen' && (
          <KitchenReportSection 
            kitchenTransactions={kitchenTransactions} 
            lastKitchenCollectionTime={lastKitchenCollectionTime}
          />
        )}
        {activeTab === 'settings' && <AdminSettingsSection user={user} />}
      </div>

      {/* Details Modal */}
      {selectedDayDetails && (
        <div className="modal-overlay" onClick={() => setSelectedDayDetails(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedDayDetails.displayDate} - Details</h2>
              <button className="modal-close" onClick={() => setSelectedDayDetails(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-summary-grid">
                <div className="modal-stat">
                  <span>Total Bookings</span>
                  <strong>{selectedDayDetails.bookings}</strong>
                </div>
                <div className="modal-stat">
                  <span>Net Profit</span>
                  <strong className={selectedDayDetails.net >= 0 ? 'text-primary' : 'text-danger'}>
                    RWF {selectedDayDetails.net.toLocaleString()}
                  </strong>
                </div>
              </div>

              <h3 className="modal-subtitle">Detailed Room Log</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDayDetails.transactions.length > 0 ? (
                      selectedDayDetails.transactions
                        .sort((a, b) => {
                          if (a.status === 'active' && b.status !== 'active') return -1
                          if (a.status !== 'active' && b.status === 'active') return 1
                          return new Date(a.time) - new Date(b.time)
                        })
                        .map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.room}</td>
                          <td>{formatTime(tx.time)}</td>
                          <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">Active</span>}</td>
                          <td className="text-success">RWF {tx.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="empty-state">No transactions recorded.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Expense Detail Modal */}
      {viewingExpense && (
        <div className="modal-overlay" onClick={() => setViewingExpense(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Expense Details</h2>
              <button className="btn-close" onClick={() => setViewingExpense(null)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-item">
                <span className="detail-label">Amount</span>
                <span className="detail-value text-danger">RWF {viewingExpense.amount.toLocaleString()}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Description</span>
                <p className="detail-text">{viewingExpense.description}</p>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Time & Date</span>
                <span className="detail-value">{formatTime(viewingExpense.time)}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">Recorded By</span>
                <span className="detail-value">{viewingExpense.workers?.name || 'Unknown'}</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setViewingExpense(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* All Expenses List Modal */}
      {showExpensesModal && (
        <div className="modal-overlay" onClick={() => setShowExpensesModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Today's Expenses List</h2>
              <button className="btn-close" onClick={() => setShowExpensesModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body p-0">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Amount</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysExpenses.length > 0 ? (
                      todaysExpenses.map((exp) => (
                        <tr key={exp.id}>
                          <td className="desc-cell">{exp.description}</td>
                          <td className="amount-cell text-danger">RWF {exp.amount.toLocaleString()}</td>
                          <td className="time-cell">{formatTime(exp.time)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className="empty-state">No expenses recorded today</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="modal-footer">
              <div className="modal-total">
                <span>Total:</span>
                <strong>RWF {totalExpenses.toLocaleString()}</strong>
              </div>
              <button className="btn-modal-close" onClick={() => setShowExpensesModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Today's Client Usage Modal */}
      {showClientsModal && (
        <div className="modal-overlay" onClick={() => setShowClientsModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Today's Room Usage Breakdown</h2>
              <button className="btn-close" onClick={() => setShowClientsModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="modal-summary-grid">
                <div className="modal-stat">
                  <span>Total Shift Clients</span>
                  <strong>{shiftTransactions.length}</strong>
                </div>
                <div className="modal-stat">
                  <span>Cash Since Collection</span>
                  <strong className="text-success">RWF {cashOnHand.toLocaleString()}</strong>
                </div>
              </div>

              <h3 className="modal-subtitle">Shift Room Log</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Check-in</th>
                      <th>Check-out</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shiftTransactions.length > 0 ? (
                      shiftTransactions
                        .sort((a, b) => {
                          if (a.status === 'active' && b.status !== 'active') return -1
                          if (a.status !== 'active' && b.status === 'active') return 1
                          return new Date(a.time) - new Date(b.time)
                        })
                        .map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.room}</td>
                          <td>{formatTime(tx.time)}</td>
                          <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">Active</span>}</td>
                          <td className="text-success">RWF {tx.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="empty-state">No clients in this shift yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setShowClientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
      {/* Today's Full Client Log Modal */}
      {showDailyClientsModal && (
        <div className="modal-overlay" onClick={() => setShowDailyClientsModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Today's Full Client Log</h2>
              <button className="btn-close" onClick={() => setShowDailyClientsModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="modal-summary-grid">
                <div className="modal-stat">
                  <span>Total Today</span>
                  <strong>{todaysTransactions.length}</strong>
                </div>
                <div className="modal-stat">
                  <span>Total Revenue</span>
                  <strong className="text-success">RWF {totalToday.toLocaleString()}</strong>
                </div>
              </div>

              <h3 className="modal-subtitle">Room-by-Room Usage</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>In</th>
                      <th>Out</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysTransactions.length > 0 ? (
                      todaysTransactions
                        .sort((a, b) => {
                          if (a.status === 'active' && b.status !== 'active') return -1
                          if (a.status !== 'active' && b.status === 'active') return 1
                          return new Date(a.time) - new Date(b.time)
                        })
                        .map((tx) => (
                        <tr key={tx.id}>
                          <td>{tx.room}</td>
                          <td>{formatTime(tx.time)}</td>
                          <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">Active</span>}</td>
                          <td className="text-success">RWF {tx.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="empty-state">No clients today yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setShowDailyClientsModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-components moved outside to prevent remounting issues
const AdminSettingsSection = ({ user }) => {
  const { updatePassword } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      return setMsg({ type: 'error', text: 'Passwords do not match' })
    }
    if (newPassword.length < 6) {
      return setMsg({ type: 'error', text: 'Password must be at least 6 characters' })
    }

    setUpdating(true)
    const res = await updatePassword(newPassword)
    setUpdating(false)

    if (res.success) {
      setMsg({ type: 'success', text: 'Password updated successfully!' })
      setNewPassword('')
      setConfirmPassword('')
    } else {
      setMsg({ type: 'error', text: res.error })
    }
  }

  return (
    <div className="settings-section">
      <div className="settings-card">
        <h2>Security Settings</h2>
        <p className="settings-subtitle">Update your administrator password below.</p>
        
        <form onSubmit={handlePasswordChange} className="settings-form">
          <div className="form-group">
            <label>New Password</label>
            <div className="password-input-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <button 
                type="button" 
                className="btn-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Confirm New Password</label>
            <div className="password-input-wrapper">
              <input 
                type={showPassword ? "text" : "password"} 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
          </div>
          
          {msg.text && (
            <div className={`settings-msg ${msg.type}`}>
              {msg.text}
            </div>
          )}

          <button type="submit" className="btn-save-settings" disabled={updating}>
            {updating ? 'Updating...' : 'Update My Password'}
          </button>
        </form>
      </div>

      <div className="settings-card">
        <h2>Staff Access Control</h2>
        <p className="settings-subtitle">Change a worker's password securely from here.</p>
        
        <StaffManagementList user={user} />
      </div>
    </div>
  )
}

const StaffManagementList = ({ user }) => {
  const [workers, setWorkers] = useState([])
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [staffPassword, setStaffPassword] = useState('')
  const [showStaffPassword, setShowStaffPassword] = useState(false)
  const [reseting, setReseting] = useState(false)
  const [staffMsg, setStaffMsg] = useState({ type: '', text: '' })

  useEffect(() => {
    fetchWorkers()
  }, [])

  const fetchWorkers = async () => {
    const { data, error } = await supabase
      .from('users')
      .select('id, role')
      .neq('id', user.id)
    
    if (!error) {
      setWorkers(data)
    }
  }

  const handleStaffReset = async (e) => {
    e.preventDefault()
    if (!selectedWorker) return
    if (staffPassword.length < 6) {
      return setStaffMsg({ type: 'error', text: 'Password must be at least 6 characters' })
    }

    setReseting(true)
    const { error } = await supabase.rpc('admin_reset_password', {
      target_user_id: selectedWorker.id,
      new_password: staffPassword
    })
    setReseting(false)

    if (!error) {
      setStaffMsg({ type: 'success', text: 'Staff password updated successfully!' })
      setStaffPassword('')
      setSelectedWorker(null)
    } else {
      setStaffMsg({ type: 'error', text: error.message })
    }
  }

  return (
    <div className="staff-management">
      {workers.length > 0 ? (
        <div className="worker-grid">
          {workers.map(w => (
            <div key={w.id} className={`worker-item ${selectedWorker?.id === w.id ? 'selected' : ''}`} onClick={() => setSelectedWorker(w)}>
              <div className="worker-icon">👤</div>
              <div className="worker-info">
                <strong>Worker Account</strong>
                <span>ID: {w.id.substring(0, 8)}...</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">No other worker accounts found.</p>
      )}

      {selectedWorker && (
        <form onSubmit={handleStaffReset} className="settings-form" style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)'}}>
          <h3>Resetting password for Selected Worker</h3>
          <div className="form-group">
            <label>New Password for Staff</label>
            <div className="password-input-wrapper">
              <input 
                type={showStaffPassword ? "text" : "password"} 
                value={staffPassword} 
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <button 
                type="button" 
                className="btn-toggle-password"
                onClick={() => setShowStaffPassword(!showStaffPassword)}
              >
                {showStaffPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {staffMsg.text && (
            <div className={`settings-msg ${staffMsg.type}`}>
              {staffMsg.text}
            </div>
          )}
          <button type="submit" className="btn-save-settings danger" disabled={reseting}>
            {reseting ? 'Reseting...' : 'Confirm Reset Staff Password'}
          </button>
          <button type="button" className="btn-modal-close" onClick={() => setSelectedWorker(null)} style={{marginTop: '0.5rem'}}>
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

const KitchenReportSection = ({ kitchenTransactions, lastKitchenCollectionTime }) => {
  const { collectKitchenCash } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)

  // 1. Pending Metrics (Since last collection)
  const pendingSales = kitchenTransactions
    .filter(t => t.type === 'order' && new Date(t.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, t) => sum + t.amount, 0)

  const pendingPurchases = kitchenTransactions
    .filter(t => t.type === 'purchase' && new Date(t.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, t) => sum + t.amount, 0)

  const pendingProfit = pendingSales - pendingPurchases

  // 2. History Generation (Last 5 Days)
  const generateHistory = () => {
    const days = []
    for (let i = 0; i < 5; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toDateString()

      const daySales = kitchenTransactions
        .filter(t => t.type === 'order' && new Date(t.created_at).toDateString() === dateStr)
        .reduce((sum, t) => sum + t.amount, 0)

      const dayPurchases = kitchenTransactions
        .filter(t => t.type === 'purchase' && new Date(t.created_at).toDateString() === dateStr)
        .reduce((sum, t) => sum + t.amount, 0)

      days.push({
        date: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        sales: daySales,
        purchases: dayPurchases,
        profit: daySales - dayPurchases
      })
    }
    return days
  }
  const history = generateHistory()

  const handleCollect = async () => {
    if (pendingProfit <= 0) return alert('No profit to collect yet.')
    if (window.confirm(`Collect RWF ${pendingProfit.toLocaleString()} (Net Profit) from kitchen?`)) {
      setIsCollecting(true)
      await collectKitchenCash()
      setIsCollecting(false)
    }
  }

  return (
    <div className="kitchen-report-section">
      <div className="cash-collection-banner" style={{marginBottom: '2rem'}}>
        <div className="cash-info">
          <h3>Kitchen Profit to Collect</h3>
          <p>Since: {lastKitchenCollectionTime.getTime() === 0 ? 'Beginning' : lastKitchenCollectionTime.toLocaleString()}</p>
        </div>
        <div className="cash-action">
          <span className="cash-amount">RWF {pendingProfit.toLocaleString()}</span>
          <button 
            className="btn-collect" 
            onClick={handleCollect}
            disabled={pendingProfit <= 0 || isCollecting}
          >
            {isCollecting ? 'Collecting...' : 'Collect Kitchen Profit'}
          </button>
        </div>
      </div>

      <div className="metrics-section">
        <div className="metric-card success">
          <h3>Pending Sales</h3>
          <p className="metric-value">RWF {pendingSales.toLocaleString()}</p>
          <span className="metric-label">Sales since last collection</span>
        </div>
        <div className="metric-card warning">
          <h3>Pending Purchases</h3>
          <p className="metric-value">RWF {pendingPurchases.toLocaleString()}</p>
          <span className="metric-label">Purchases since last collection</span>
        </div>
        <div className={`metric-card ${pendingProfit >= 0 ? 'primary' : 'danger'}`}>
          <h3>Pending Profit (for Dad)</h3>
          <p className="metric-value">RWF {pendingProfit.toLocaleString()}</p>
          <span className="metric-label">Net profit since collection</span>
        </div>
      </div>

      <div className="panel-section" style={{marginBottom: '2rem'}}>
        <h2>5-Day Kitchen History</h2>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Daily Sales</th>
                <th>Daily Purchases</th>
                <th>Daily Profit</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td><strong>{h.date}</strong></td>
                  <td>RWF {h.sales.toLocaleString()}</td>
                  <td>RWF {h.purchases.toLocaleString()}</td>
                  <td className={h.profit >= 0 ? 'text-success' : 'text-danger'} style={{fontWeight: 'bold'}}>
                    RWF {h.profit.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-section">
        <h2>Detailed Kitchen Log</h2>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Description</th>
                <th>Served By</th>
                <th>Amount</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {kitchenTransactions.length > 0 ? (
                kitchenTransactions.map(t => (
                  <tr key={t.id}>
                    <td>
                      <span className={`status-badge ${t.type === 'order' ? 'occupied' : 'completed'}`}>
                        {t.type === 'order' ? 'Sale' : 'Purchase'}
                      </span>
                    </td>
                    <td>{t.description}</td>
                    <td>{t.served_by || '--'}</td>
                    <td className={t.type === 'order' ? 'text-success' : 'text-danger'}>
                      {t.type === 'order' ? '+' : '-'} RWF {t.amount.toLocaleString()}
                    </td>
                    <td>{new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No kitchen transactions found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
