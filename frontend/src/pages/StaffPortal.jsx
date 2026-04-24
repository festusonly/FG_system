import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/StaffPortal.css'

export default function StaffPortal() {
  const { user, logout } = useAuth()
  const { rooms, transactions, expenses, lastCollectionTime, bookRoom, checkoutRoom, reportExpense, loadingData, t, language, changeLanguage, isOffline } = useApp()
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
  const [showExpenseDetails, setShowExpenseDetails] = useState(false)
  const [showClientsModal, setShowClientsModal] = useState(false)
  const [showDailyClientsModal, setShowDailyClientsModal] = useState(false)
  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'occupied', 'available'

  // Filter out system events (markers) from real expenses
  const realExpenses = expenses.filter(exp => 
    exp.description !== 'SYSTEM_CASH_COLLECTION' && 
    exp.description !== 'KITCHEN_CASH_COLLECTION'
  )

  // Filter for TODAY'S data only
  const todayString = new Date().toDateString()
  const todaysTransactions = transactions.filter(tx => new Date(tx.time).toDateString() === todayString)
  const todaysExpenses = realExpenses.filter(exp => new Date(exp.time).toDateString() === todayString)

  // Cash on Hand: all transactions since the last collection
  const cashOnHand = transactions
    .filter(tx => {
      const txTime = new Date(tx.time).getTime()
      const collTime = lastCollectionTime.getTime()
      return txTime > collTime
    })
    .reduce((sum, tx) => sum + tx.amount, 0)

  // Stats
  const totalRoomsTaken = rooms.filter(r => r.status === 'occupied').length
  const totalMoney = todaysTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpenses = todaysExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netRevenue = totalMoney - totalExpenses

  // Shift Transactions: all transactions since the last collection
  const shiftTransactions = transactions.filter(tx => {
    const txTime = new Date(tx.time).getTime()
    const collTime = lastCollectionTime.getTime()
    return txTime > collTime
  })

  // Filtered rooms
  const displayedRooms = rooms
    .filter(r => roomFilter === 'all' || r.status === roomFilter)
    .sort((a, b) => {
      // Prioritize occupied rooms
      if (a.status === 'occupied' && b.status !== 'occupied') return -1
      if (a.status !== 'occupied' && b.status === 'occupied') return 1
      // Then sort numerically by roomNumber
      return parseInt(a.roomNumber) - parseInt(b.roomNumber)
    })

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

  const formatTime = (dateString) => {
    if (!dateString) return '--'
    const date = new Date(dateString)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
          <h1>{t('staff_portal')}</h1>
          <p>Welcome, {user?.email}</p>
        </div>
        <div className="header-actions" style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          <div className="language-switch" style={{display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '30px', border: '1px solid #e2e8f0'}}>
             <button 
               onClick={() => changeLanguage('en')}
               style={{
                 background: language === 'en' ? '#0d9488' : 'transparent', 
                 color: language === 'en' ? 'white' : '#64748b', 
                 border: 'none', 
                 padding: '5px 12px', 
                 borderRadius: '25px', 
                 cursor: 'pointer', 
                 fontWeight: 'bold',
                 fontSize: '0.85rem',
                 transition: 'all 0.3s ease'
               }}
             >EN</button>
             <button 
               onClick={() => changeLanguage('rw')}
               style={{
                 background: language === 'rw' ? '#0d9488' : 'transparent', 
                 color: language === 'rw' ? 'white' : '#64748b', 
                 border: 'none', 
                 padding: '5px 12px', 
                 borderRadius: '25px', 
                 cursor: 'pointer', 
                 fontWeight: 'bold',
                 fontSize: '0.85rem',
                 transition: 'all 0.3s ease'
               }}
             >RW</button>
          </div>
          <button onClick={handleLogout} className="btn-logout">{t('logout')}</button>
        </div>
      </header>

      <div className="staff-content">
        {isOffline && (
          <div className="offline-banner" style={{background: '#fffbeb', color: '#b45309', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
             <span style={{fontSize: '1.5rem'}}>📡</span>
             <div>
               <div style={{fontSize: '1rem'}}>{t('offline_mode')}</div>
               <div style={{fontSize: '0.85rem', fontWeight: 'normal', opacity: 0.9}}>{t('viewing_cached_data')}</div>
             </div>
          </div>
        )}
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
            <h3>{t('occupied')}</h3>
            <p className="stat-value">{totalRoomsTaken}</p>
          </div>
          <div 
            className={`stat-card clickable ${roomFilter === 'available' ? 'active-filter' : ''}`}
            onClick={() => handleFilterCard('available')}
          >
            <h3>{t('available')}</h3>
            <p className="stat-value">{rooms.length - totalRoomsTaken}</p>
          </div>
          <div className="stat-card primary-stat">
            <h3>{t('net_revenue')}</h3>
            <p className="stat-value">RWF {netRevenue.toLocaleString()}</p>
          </div>
          <div className="stat-card">
            <h3>{t('total_clients')}</h3>
            <p className="stat-value">{todaysTransactions.length}</p>
            <button className="btn-details-card" onClick={() => setShowDailyClientsModal(true)}>
              {t('view_details')}
            </button>
          </div>
          <div className="stat-card">
            <h3>{t('clients_in_shift') || 'Clients in Shift'}</h3>
            <p className="stat-value">{shiftTransactions.length}</p>
            <button className="btn-details-card" onClick={() => setShowClientsModal(true)}>
              {t('view_details')}
            </button>
          </div>
          <div className="stat-card">
            <h3>{t('total_expenses')}</h3>
            <p className="stat-value">RWF {totalExpenses.toLocaleString()}</p>
            <button className="btn-details-card" onClick={() => setShowExpenseDetails(true)}>
              {t('view_details')}
            </button>
          </div>
          <div className="stat-card action-stat">
             <button className="btn-expense" onClick={() => setShowExpenseForm(true)}>
               {t('record_expense')}
             </button>
          </div>
        </div>

        {/* Expense Form Modal */}
        {showExpenseForm && (
          <div className="modal-overlay">
            <form className="modal-form" onSubmit={handleExpenseSubmit}>
              <h3>{t('record_expense')}</h3>
              <div className="form-group">
                <label htmlFor="expenseAmount">{t('expense_amount')}</label>
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
                <label htmlFor="expenseDescription">{t('expense_description')}</label>
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
                  {submitting ? t('loading') : t('save_expense')}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowExpenseForm(false)}
                >
                  {t('cancel')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Room Selection */}
        <div className="rooms-section" id="rooms-section">
          <h2>{t('rooms_overview')} {roomFilter !== 'all' && `(${t(roomFilter) || roomFilter})`}</h2>
          <div className="rooms-grid">
            {displayedRooms.map((room) => (
              <button
                key={room.id}
                className={`room-btn ${room.status} ${selectedRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => handleRoomSelect(room)}
              >
                <span className="room-name">{room.name}</span>
                <span className="room-status-label">
                  {room.status === 'occupied' ? t('occupied') : t('available')}
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
              <h3>{selectedRoom.name} - {t('occupied')}</h3>
              {activeTx ? (
                <>
                  <p><strong>{t('type')}:</strong> {t(activeTx.type) || activeTx.type.replace(/_/g, ' ')}</p>
                  {activeTx.days && <p><strong>{t('number_of_days')}:</strong> {activeTx.days}</p>}
                  <p><strong>{t('amount_paid')}:</strong> RWF {activeTx.amount.toLocaleString()}</p>
                </>
              ) : (
                <p>No active booking found.</p>
              )}
              <button
                className="btn-checkout"
                onClick={() => handleCheckout(selectedRoom.id)}
                disabled={submitting}
              >
                {submitting ? t('loading') : t('check_out')}
              </button>
            </div>
          )
        })()}

        {/* Booking Form Modal */}
        {showForm && selectedRoom && selectedRoom.status === 'available' && (
          <div className="modal-overlay">
            <form className="modal-form" onSubmit={handleBookingSubmit}>
              <h3>{t('record_new_booking')} - {selectedRoom.name}</h3>

              <div className="form-group">
                <label>{t('select_stay_type')}</label>
                <div className="toggle-buttons">
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'short_hours' ? 'active' : ''}`}
                    onClick={() => setStayType('short_hours')}
                  >
                    {t('short_stay')}
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'night' ? 'active' : ''}`}
                    onClick={() => setStayType('night')}
                  >
                    {t('night_stay')}
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${stayType === 'many_days' ? 'active' : ''}`}
                    onClick={() => setStayType('many_days')}
                  >
                    {t('number_of_days')}
                  </button>
                </div>
              </div>

              {stayType === 'many_days' && (
                <div className="form-group">
                  <label htmlFor="days">{t('number_of_days')}</label>
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
                <label htmlFor="amount">{t('total_amount_rwf')}</label>
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
                  {submitting ? t('loading') : t('book_room_btn')}
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
        {/* Today's Client Usage Modal */}
        {showClientsModal && (
          <div className="modal-overlay" onClick={() => setShowClientsModal(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('work_done_today')}</h2>
                <button className="btn-close" onClick={() => setShowClientsModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="modal-summary-grid">
                  <div className="modal-stat">
                    <span>{t('clients_in_shift') || 'Clients in Shift'}</span>
                    <strong>{shiftTransactions.length}</strong>
                  </div>
                  <div className="modal-stat">
                    <span>{t('cash_in_drawer')}</span>
                    <strong className="text-success">RWF {cashOnHand.toLocaleString()}</strong>
                  </div>
                </div>
                <h3 className="modal-subtitle">{t('detailed_log')}</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('room')}</th>
                        <th>{t('check_in')}</th>
                        <th>{t('check_out')}</th>
                        <th>{t('amount')}</th>
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
                <button className="btn-modal-close" onClick={() => setShowClientsModal(false)}>{t('close')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Today's Expenses List Modal */}
        {showExpenseDetails && (
          <div className="modal-overlay" onClick={() => setShowExpenseDetails(false)}>
            <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('total_expenses')}</h2>
                <button className="btn-close" onClick={() => setShowExpenseDetails(false)}>&times;</button>
              </div>
              <div className="modal-body p-0">
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('expense_description')}</th>
                        <th>{t('amount')}</th>
                        <th>{t('time')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todaysExpenses.length > 0 ? (
                        todaysExpenses.map((exp) => (
                          <tr key={exp.id}>
                            <td className="desc-cell">{exp.description}</td>
                            <td className="amount-cell text-danger">RWF {exp.amount.toLocaleString()}</td>
                            <td className="time-cell">{new Date(exp.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="3" className="empty-state">{t('no_expenses')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <div className="modal-total">
                  <span>{t('confirm')}:</span>
                  <strong>RWF {totalExpenses.toLocaleString()}</strong>
                </div>
                <button className="btn-modal-close" onClick={() => setShowExpenseDetails(false)}>{t('close')}</button>
              </div>
            </div>
          </div>
        )}
        {/* Today's Full Client Log Modal (Staff View) */}
        {showDailyClientsModal && (
          <div className="modal-overlay" onClick={() => setShowDailyClientsModal(false)}>
            <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('work_done_today')}</h2>
                <button className="btn-close" onClick={() => setShowDailyClientsModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div className="modal-summary-grid">
                  <div className="modal-stat">
                    <span>{t('total_clients')}</span>
                    <strong>{todaysTransactions.length}</strong>
                  </div>
                  <div className="modal-stat">
                    <span>{t('net_revenue')}</span>
                    <strong className="text-success">RWF {totalMoney.toLocaleString()}</strong>
                  </div>
                </div>
                <h3 className="modal-subtitle">{t('room_utilization')}</h3>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('room')}</th>
                        <th>{t('check_in')}</th>
                        <th>{t('check_out')}</th>
                        <th>{t('amount')}</th>
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
                          <td colSpan="4" className="empty-state">{t('no_transactions')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-modal-close" onClick={() => setShowDailyClientsModal(false)}>{t('close')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
