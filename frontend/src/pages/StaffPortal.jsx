import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/StaffPortal.css'

export default function StaffPortal() {
  const { user, logout } = useAuth()
  const { rooms, transactions, expenses, bookRoom, checkoutRoom, reportExpense, loadingData } = useApp()
  const navigate = useNavigate()

  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [amount, setAmount] = useState('')
  const [stayType, setStayType] = useState('short_hours')
  const [days, setDays] = useState(1)
  const [showForm, setShowForm] = useState(false)
  
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'occupied', 'available'

  // Stats
  const totalRoomsTaken = rooms.filter(r => r.status === 'occupied').length
  const totalMoney = transactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netRevenue = totalMoney - totalExpenses

  // Filtered rooms
  const displayedRooms = rooms.filter(r => roomFilter === 'all' || r.status === roomFilter)

  // Helper: find the active transaction for a room
  const getActiveTransaction = (roomId) =>
    transactions.find(tx => tx.roomId === roomId && tx.status === 'active')

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const scrollToSection = (id) => {
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  const handleFilterCard = (filter) => {
    setRoomFilter(prev => prev === filter ? 'all' : filter)
    scrollToSection('rooms-section')
  }

  const handleRoomSelect = (room) => {
    setSelectedRoom(room)
    if (room.status === 'available') {
      setShowForm(true)
    } else {
      // Occupied — scroll to checkout panel
      scrollToSection('checkout-panel')
    }
  }

  const handleCheckout = async (roomId) => {
    setSubmitting(true)
    setActionError('')
    const result = await checkoutRoom(roomId)
    setSubmitting(false)
    if (!result.success) {
      setActionError(result.error || 'Failed to check out room.')
    } else {
      setSelectedRoom(null)
    }
  }

  const handleBookingSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setActionError('')
    const result = await bookRoom(selectedRoom.id, {
      stayType,
      amount,
      days: stayType === 'many_days' ? days : null,
    })
    setSubmitting(false)
    if (!result.success) {
      setActionError(result.error || 'Failed to book room.')
    } else {
      setAmount('')
      setDays(1)
      setStayType('short_hours')
      setShowForm(false)
      setSelectedRoom(null)
    }
  }

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setActionError('')
    const result = await reportExpense(expenseAmount, expenseDescription)
    setSubmitting(false)
    if (!result.success) {
      setActionError(result.error || 'Failed to report expense.')
    } else {
      setExpenseAmount('')
      setExpenseDescription('')
      setShowExpenseForm(false)
    }
  }

  return (
    <div className="staff-portal">
      <header className="staff-header">
        <div className="header-left">
          <h1>Worker Portal</h1>
          <p>Welcome, {user?.email}</p>
        </div>
        <button onClick={handleLogout} className="btn-logout">
          Logout
        </button>
      </header>

      <div className="staff-content">
        {/* Global action error */}
        {actionError && (
          <div className="action-error-banner">
            {actionError}
            <button onClick={() => setActionError('')}>Dismiss</button>
          </div>
        )}

        {/* Loading state */}
        {loadingData && (
          <div className="loading-banner">Loading room data...</div>
        )}

        {/* Dashboard Stats */}
        <div className="dashboard-stats">
          <div 
            className={`stat-card clickable ${roomFilter === 'occupied' ? 'active-filter' : ''}`}
            onClick={() => handleFilterCard('occupied')}
          >
            <h3>Occupied Rooms</h3>
            <p className="stat-value">{totalRoomsTaken}</p>
          </div>
          <div 
            className={`stat-card clickable ${roomFilter === 'available' ? 'active-filter' : ''}`}
            onClick={() => handleFilterCard('available')}
          >
            <h3>Remaining Rooms</h3>
            <p className="stat-value">{rooms.length - totalRoomsTaken}</p>
          </div>
          <div className="stat-card primary-stat">
            <h3>Net Revenue</h3>
            <p className="stat-value">RWF {netRevenue.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>Total Revenue</h3>
            <p className="stat-value">RWF {totalMoney.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>Total Expenses</h3>
            <p className="stat-value">RWF {totalExpenses.toLocaleString()}</p>
          </div>
          <div className="stat-card action-stat">
             <button className="btn-expense" onClick={() => setShowExpenseForm(true)}>
               Report Expense
             </button>
          </div>
        </div>

        {/* Expense Form Modal */}
        {showExpenseForm && (
          <div className="modal-overlay">
            <form className="modal-form" onSubmit={handleExpenseSubmit}>
              <h3>Report an Expense</h3>
              <div className="form-group">
                <label htmlFor="expenseAmount">Amount (RWF)</label>
                <input
                  id="expenseAmount"
                  type="number"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  min="1"
                />
              </div>
              <div className="form-group">
                <label htmlFor="expenseDescription">Description</label>
                <textarea
                  id="expenseDescription"
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  placeholder="What was this money used for?"
                  required
                  rows="3"
                ></textarea>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Expense'}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowExpenseForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Room Selection */}
        <div className="rooms-section" id="rooms-section">
          <h2>Select a Room {roomFilter !== 'all' && `(${roomFilter})`}</h2>
          <div className="rooms-grid">
            {displayedRooms.map((room) => (
              <button
                key={room.id}
                className={`room-btn ${room.status} ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => handleRoomSelect(room)}
              >
                <span className="room-name">{room.name}</span>
                <span className="room-status-label">
                  {room.status === 'occupied' ? 'Occupied' : 'Available'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Room Details / Checkout */}
        {selectedRoom && selectedRoom.status === 'occupied' && (() => {
          const activeTx = getActiveTransaction(selectedRoom.id)
          return (
            <div className="room-details-panel" id="checkout-panel">
              <h3>{selectedRoom.name} - Occupied</h3>
              {activeTx ? (
                <>
                  <p><strong>Stay Type:</strong> {activeTx.type.replace(/_/g, ' ')}</p>
                  {activeTx.days && <p><strong>Days:</strong> {activeTx.days}</p>}
                  <p><strong>Amount Paid:</strong> RWF {activeTx.amount.toLocaleString()}</p>
                </>
              ) : (
                <p>No active booking found.</p>
              )}
              <button
                className="btn-checkout"
                onClick={() => handleCheckout(selectedRoom.id)}
                disabled={submitting}
              >
                {submitting ? 'Checking out...' : 'Check Out & Clear Room'}
              </button>
            </div>
          )
        })()}

        {/* Booking Form Modal */}
        {showForm && selectedRoom && selectedRoom.status === 'available' && (
          <div className="modal-overlay">
            <form className="modal-form" onSubmit={handleBookingSubmit}>
              <h3>Book {selectedRoom.name}</h3>

              <div className="form-group">
                <label>Stay Duration</label>
                <div className="toggle-buttons">
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'short_hours' ? 'active' : ''}`}
                    onClick={() => setStayType('short_hours')}
                  >
                    Short Hours
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'night' ? 'active' : ''}`}
                    onClick={() => setStayType('night')}
                  >
                    Night
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'many_days' ? 'active' : ''}`}
                    onClick={() => setStayType('many_days')}
                  >
                    Many Days
                  </button>
                </div>
              </div>

              {stayType === 'many_days' && (
                <div className="form-group">
                  <label htmlFor="days">Number of Days</label>
                  <input
                    id="days"
                    type="number"
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value) || 1)}
                    min="1"
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="amount">Amount Collected (RWF)</label>
                <input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                  min="0"
                />
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Confirm Booking'}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => {
                    setShowForm(false)
                    setSelectedRoom(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
