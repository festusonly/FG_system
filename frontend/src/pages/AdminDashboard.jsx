import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/AdminDashboard.css'

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const { rooms, transactions, expenses, lastCollectionTime, collectCash } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'history'
  const [selectedDayDetails, setSelectedDayDetails] = useState(null)

  const todayString = new Date().toDateString()
  
  // Filter out system events from real expenses
  const realExpenses = expenses.filter(exp => exp.description !== 'SYSTEM_CASH_COLLECTION')

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
  const shortStayCount = activeTransactions.filter(tx => tx.type === 'short_hours').length
  const nightStayCount = activeTransactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length

  const displayedRooms = rooms.filter(r => roomFilter === 'all' || r.status === roomFilter)

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
        </div>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="dashboard-content">
        {activeTab === 'overview' ? (
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
                        <td className="time-cell">{formatDate(tx.time)}</td>
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
                    {todaysExpenses.length > 0 ? (
                      todaysExpenses.map((exp) => (
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
                          No expenses recorded today
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
          </>
        ) : (
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

              <h3 className="modal-subtitle">Rooms Breakdown</h3>
              <div className="modal-rooms-list">
                {(() => {
                  const breakdown = {}
                  selectedDayDetails.transactions.forEach(tx => {
                    const rName = tx.room || 'Unknown'
                    if (!breakdown[rName]) {
                      breakdown[rName] = { total: 0, short: 0, night: 0 }
                    }
                    breakdown[rName].total++
                    if (tx.type === 'short_hours') {
                      breakdown[rName].short++
                    } else {
                      breakdown[rName].night++
                    }
                  })

                  const sortedRooms = Object.entries(breakdown).sort((a, b) => a[0].localeCompare(b[0]))

                  if (sortedRooms.length === 0) {
                    return <p className="empty-state" style={{padding: '1rem'}}>No rooms used this day.</p>
                  }

                  return sortedRooms.map(([roomName, stats]) => (
                    <div key={roomName} className="modal-room-item">
                      <div className="room-item-header">
                        <h4>{roomName}</h4>
                        <span className="room-item-total">{stats.total} total uses</span>
                      </div>
                      <div className="room-item-stats">
                        <span className="stat-short">{stats.short} Short Stay{stats.short !== 1 && 's'}</span>
                        <span className="stat-night">{stats.night} Night Stay{stats.night !== 1 && 's'}</span>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
