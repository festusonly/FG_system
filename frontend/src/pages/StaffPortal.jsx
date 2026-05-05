import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/StaffPortal.css'

export default function StaffPortal() {
  const { user, logout } = useAuth()
  const { rooms, transactions, expenses, lastCollectionTime, bookRoom, checkoutRoom, reportExpense, loadingData, t, language, changeLanguage, isOffline, deferredPrompt, installPWA, isPWAInstalled, refreshData, employees, recordDeduction } = useApp()
  const navigate = useNavigate()

  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [amount, setAmount] = useState('')
  const [stayType, setStayType] = useState('short_hours')
  const [days, setDays] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseDescription, setExpenseDescription] = useState('')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showExpenseDetails, setShowExpenseDetails] = useState(false)
  const [showClientsModal, setShowClientsModal] = useState(false)
  const [showDailyClientsModal, setShowDailyClientsModal] = useState(false)
  const [roomFilter, setRoomFilter] = useState(() => {
    return localStorage.getItem('staffRoomFilter') || 'all'
  })

  React.useEffect(() => {
    localStorage.setItem('staffRoomFilter', roomFilter)
  }, [roomFilter])
  // Deduction States
  const [showDeductionModal, setShowDeductionModal] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [deductionEmployeeId, setDeductionEmployeeId] = useState('')
  const [deductionType, setDeductionType] = useState('loan')
  const [deductionAmount, setDeductionAmount] = useState('')
  const [deductionReason, setDeductionReason] = useState('')

  // Filter out system events (markers) from real expenses
  const realExpenses = expenses.filter(exp => 
    exp.description !== 'SYSTEM_CASH_COLLECTION' && 
    exp.description !== 'KITCHEN_CASH_COLLECTION'
  )

  // Filter for TODAY'S data only
  const todayString = new Date().toDateString()
  const todaysTransactions = transactions.filter(tx => new Date(tx.time).toDateString() === todayString)
  
  // Deduplicated today's list for display
  const todaysTxDeduped = (() => {
    const completed = todaysTransactions.filter(tx => tx.status !== 'active')
    const activeOnly = todaysTransactions.filter(tx => tx.status === 'active')
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    const seenActive = new Set()
    const uniqueActive = []
    for (const tx of activeOnly) {
      if (!seenActive.has(tx.roomId)) {
        seenActive.add(tx.roomId)
        uniqueActive.push(tx)
      }
    }
    return [...completed, ...uniqueActive]
  })()

  const todaysExpenses = realExpenses.filter(exp => new Date(exp.time).toDateString() === todayString)

  // Shift Calculations (Since Last Collection)
  const shiftTransactions = transactions.filter(tx => {
    const txTime = new Date(tx.time).getTime()
    const collTime = lastCollectionTime.getTime()
    return txTime > collTime
  })

  const shiftExpenses = realExpenses.filter(exp => {
    if (!exp.time) return false;
    const txTime = new Date(exp.time).getTime()
    const collTime = lastCollectionTime ? new Date(lastCollectionTime).getTime() : 0
    return txTime > collTime
  })

  // Deduplicated shift list for DISPLAY & CASH (collapsed duplicates per room)
  const shiftTxDeduped = (() => {
    const completed = shiftTransactions.filter(tx => tx.status !== 'active')
    const activeOnly = shiftTransactions.filter(tx => tx.status === 'active')
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    const seenActive = new Set()
    const uniqueActive = []
    for (const tx of activeOnly) {
      if (!seenActive.has(tx.roomId)) {
        seenActive.add(tx.roomId)
        uniqueActive.push(tx)
      }
    }
    return [...completed, ...uniqueActive]
  })()

  const cashOnHand = shiftTxDeduped.reduce((sum, tx) => sum + tx.amount, 0)
  const totalShiftExpenses = shiftExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netCashInDrawer = cashOnHand - totalShiftExpenses

  // Stats (Ground Truth from rooms table)
  const totalRoomsTaken = rooms.filter(r => r.status === 'occupied').length
  const totalMoneyToday = todaysTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpensesToday = todaysExpenses.reduce((sum, exp) => sum + exp.amount, 0)

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
    if (!showConfirmation) {
      setShowConfirmation(true)
      return
    }
    
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
      setShowConfirmation(false)
    } else {
      setAmount('')
      setDays(1)
      setStayType('short_hours')
      setShowForm(false)
      setShowConfirmation(false)
      setSelectedRoom(null)
    }
  }

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setActionError('')
    try {
      const result = await reportExpense(expenseAmount, expenseDescription)
      setSubmitting(false)
      if (!result.success) {
        setActionError(result.error || 'Failed to report expense.')
      } else {
        setExpenseAmount('')
        setExpenseDescription('')
        setShowExpenseForm(false)
      }
    } catch (err) {
      console.error('Failed to save expense:', err)
      setActionError(err.message || 'Failed to save expense.')
      setSubmitting(false)
    }
  }

  const handleDeductionSubmit = async (e) => {
    e.preventDefault()
    if (!deductionEmployeeId || !deductionAmount) return
    if (deductionType === 'fine' && !deductionReason) return
    
    setSubmitting(true)
    setActionError('')
    const finalReason = deductionType === 'loan' ? 'Loan / Salary Advance' : deductionReason;
    const result = await recordDeduction(deductionEmployeeId, deductionType, deductionAmount, finalReason)
    setSubmitting(false)
    
    if (!result.success) {
      setActionError(result.error || 'Failed to record deduction.')
    } else {
      setDeductionEmployeeId('')
      setDeductionType('loan')
      setDeductionAmount('')
      setDeductionReason('')
      setShowDeductionModal(false)
    }
  }

  return (
    <div className="staff-portal">
      <header className="staff-header">
        <div className="header-left" style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <button 
            onClick={() => setShowSidebar(true)}
            style={{background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center'}}
          >
            ☰
          </button>
          <div>
            <h1>{t('staff_portal')}</h1>
            <p style={{fontSize: '0.8rem', opacity: 0.9}}>Welcome, {user?.email}</p>
          </div>
        </div>
        <div className="header-actions" style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>

           {deferredPrompt && !isPWAInstalled && (
            <button 
              onClick={installPWA}
              style={{
                background: 'linear-gradient(135deg, #0d9488, #0f766e)',
                color: 'white',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span>📲</span> {t('install_app') || 'Install App'}
            </button>
          )}

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
          {/* 1. Cash to Give (Current Shift) */}
          <div className="stat-card" style={{border: '1.5px solid #2dd4bf', background: 'rgba(45, 212, 191, 0.05)'}}>
            <h3 style={{color: '#64748b'}}>{t('cash_to_give')}</h3>
            <p className="stat-value" style={{color: '#0d9488'}}>RWF {netCashInDrawer.toLocaleString()}</p>
          </div>

          {/* 2. Clients in Shift */}
          <div className="stat-card" style={{border: '1.5px solid #818cf8', background: 'rgba(129, 140, 248, 0.05)'}}>
            <h3>{t('clients_in_shift')}</h3>
            <p className="stat-value">{shiftTxDeduped.length}</p>
            <button className="btn-details-card" onClick={() => setShowClientsModal(true)}>
              {t('view_details')}
            </button>
          </div>

          {/* 3. Occupied */}
          <div 
            className={`stat-card clickable ${roomFilter === 'occupied' ? 'active-filter' : ''}`}
            onClick={() => handleFilterCard('occupied')}
            style={{border: '1.5px solid #fb7185', background: 'rgba(251, 113, 133, 0.05)'}}
          >
            <h3>{t('occupied')}</h3>
            <p className="stat-value">{totalRoomsTaken}</p>
          </div>

          {/* 4. Available */}
          <div 
            className={`stat-card clickable ${roomFilter === 'available' ? 'active-filter' : ''}`}
            onClick={() => handleFilterCard('available')}
            style={{border: '1.5px solid #34d399', background: 'rgba(52, 211, 153, 0.05)'}}
          >
            <h3>{t('available')}</h3>
            <p className="stat-value">{rooms.length - totalRoomsTaken}</p>
          </div>

          {/* 5. Today's Expenses */}
          <div className="stat-card" style={{border: '1.5px solid #fbbf24', background: 'rgba(251, 191, 36, 0.05)'}}>
            <h3>{t('total_expenses')}</h3>
            <p className="stat-value" style={{color: '#ef4444'}}>RWF {Number(totalShiftExpenses).toLocaleString()}</p>
            <button className="btn-details-card" onClick={() => setShowExpenseDetails(true)}>
              {t('view_details')}
            </button>
          </div>

          <div className="stat-card action-stat" style={{border: '1.5px solid #94a3b8', background: 'rgba(148, 163, 184, 0.05)'}}>
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

        {/* Deduction Form Modal */}
        {showDeductionModal && (
          <div className="modal-overlay">
            <form className="modal-form" onSubmit={handleDeductionSubmit}>
              <h3>Report Deduction (Loan / Fine)</h3>
              
              <div className="form-group">
                <label>Employee</label>
                <select
                  value={deductionEmployeeId}
                  onChange={(e) => setDeductionEmployeeId(e.target.value)}
                  required
                  style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1'}}
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Type</label>
                <div className="toggle-buttons" style={{display: 'flex', gap: '0.5rem'}}>
                  <button
                    type="button"
                    className={`toggle-btn ${deductionType === 'loan' ? 'active' : ''}`}
                    onClick={() => setDeductionType('loan')}
                    style={{flex: 1}}
                  >
                    Loan (Avance)
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn ${deductionType === 'fine' ? 'active' : ''}`}
                    onClick={() => setDeductionType('fine')}
                    style={{flex: 1, backgroundColor: deductionType === 'fine' ? '#ef4444' : ''}}
                  >
                    Fine
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Amount (RWF)</label>
                <input
                  type="number"
                  value={deductionAmount}
                  onChange={(e) => setDeductionAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  required
                  min="1"
                  style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1'}}
                />
              </div>

              {deductionType === 'fine' && (
                <div className="form-group">
                  <label>Reason / Details (Required for Fines)</label>
                  <textarea
                    value={deductionReason}
                    onChange={(e) => setDeductionReason(e.target.value)}
                    placeholder="Explain the reason for this fine..."
                    required
                    rows="3"
                    style={{width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', resize: 'vertical'}}
                  />
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? t('loading') : 'Save Deduction'}
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowDeductionModal(false)}
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
                  {room.status === 'occupied' ? t('kirimo_umuntu') : t('kirimo_ubusa')}
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
              <h3>{selectedRoom.name} - {t('kirimo_umuntu')}</h3>
              {activeTx ? (
                <>
                  <p><strong>{t('type')}:</strong> {t(activeTx.type) || activeTx.type.replace(/_/g, ' ')}</p>
                  {activeTx.days && <p><strong>{t('number_of_days')}:</strong> {activeTx.days}</p>}
                  <p><strong>{t('since')}:</strong> {formatTime(activeTx.time)}</p>
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
              <div style={{textAlign: 'center', marginBottom: '1.5rem', background: '#f0fdfa', padding: '1rem', borderRadius: '12px', border: '2px solid #0d9488'}}>
                <span style={{fontSize: '0.85rem', color: '#0d9488', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em'}}>{t('booking_for') || "Booking for"}</span>
                <h2 style={{fontSize: '2.5rem', color: '#0d9488', margin: '0.25rem 0'}}>{selectedRoom.name}</h2>
              </div>

              {!showConfirmation ? (
                <>
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
                </>
              ) : (
                <div className="confirmation-review" style={{background: '#fffbeb', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fde68a', marginBottom: '1.5rem'}}>
                  <h4 style={{margin: '0 0 1rem 0', color: '#92400e', textAlign: 'center', fontSize: '1.1rem'}}>{t('please_review_booking') || "Please Review Booking"}</h4>
                  <div style={{display: 'flex', flexDirection: 'column', gap: '0.75rem'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#92400e'}}>{t('room')}:</span>
                      <strong style={{fontSize: '1.2rem'}}>{selectedRoom.name}</strong>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#92400e'}}>{t('type')}:</span>
                      <strong>{t(stayType) || stayType}</strong>
                    </div>
                    {stayType === 'many_days' && (
                      <div style={{display: 'flex', justifyContent: 'space-between'}}>
                        <span style={{color: '#92400e'}}>{t('days')}:</span>
                        <strong>{days}</strong>
                      </div>
                    )}
                    <div style={{display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fde68a', paddingTop: '0.75rem', marginTop: '0.25rem'}}>
                      <span style={{color: '#92400e', fontWeight: 'bold'}}>{t('total_amount')}:</span>
                      <strong style={{fontSize: '1.25rem', color: '#0d9488'}}>RWF {parseFloat(amount).toLocaleString()}</strong>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-actions" style={{flexDirection: 'column', gap: '0.75rem'}}>
                {!showConfirmation ? (
                  <button type="submit" className="btn-submit" style={{width: '100%', padding: '1rem'}}>
                    {t('book_room_btn')}
                  </button>
                ) : (
                  <button type="submit" className="btn-submit" disabled={submitting} style={{width: '100%', padding: '1rem', background: '#0d9488'}}>
                    {submitting ? t('loading') : `${t('confirm_and_save') || "Confirm & Save"}`}
                  </button>
                )}
                <button
                  type="button"
                  className="btn-cancel"
                  style={{width: '100%', background: 'transparent', border: 'none', color: '#64748b', textDecoration: 'underline'}}
                  onClick={() => {
                    if (showConfirmation) {
                      setShowConfirmation(false)
                    } else {
                      setShowForm(false)
                      setSelectedRoom(null)
                    }
                  }}
                >
                  {showConfirmation ? t('go_back_edit') || "Go back and edit" : t('cancel')}
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
                    <span>{t('cash_to_give')}</span>
                    <strong style={{color: '#0d9488'}}>RWF {Number(netCashInDrawer).toLocaleString()}</strong>
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
                      {shiftTxDeduped.length > 0 ? (
                        shiftTxDeduped
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
                            <td className="text-success">RWF {Number(tx.amount).toLocaleString()}</td>
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

        {/* Shift Expenses List Modal (Admin Mirror) */}
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
                      {Array.isArray(shiftExpenses) && shiftExpenses.length > 0 ? (
                        shiftExpenses.map((exp) => (
                          <tr key={exp.id}>
                            <td className="desc-cell"><span className="entry-desc-modern" style={{whiteSpace: 'pre-line', display: 'block', lineHeight: '1.4'}}>{exp.description}</span></td>
                            <td className="amount-cell" style={{color: '#ef4444', fontWeight: '700'}}>RWF {Number(exp.amount).toLocaleString()}</td>
                            <td className="time-cell">{formatTime(exp.time)}</td>
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
                  <span>{t('total_expenses')}:</span>
                  <strong>RWF {Number(totalShiftExpenses || 0).toLocaleString()}</strong>
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
                    <strong>{todaysTxDeduped.length}</strong>
                  </div>
                  <div className="modal-stat">
                    <span>{t('net_revenue')}</span>
                    <strong style={{color: '#0d9488'}}>RWF {totalMoney.toLocaleString()}</strong>
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
                      {todaysTxDeduped.length > 0 ? (
                        todaysTxDeduped
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

      <div style={{textAlign: 'center', marginTop: '2rem', paddingBottom: '2rem'}}>
        <button 
          onClick={() => refreshData()}
          style={{
            background: 'transparent',
            color: '#94a3b8',
            border: '1px solid #cbd5e1',
            padding: '8px 16px',
            borderRadius: '20px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            transition: 'all 0.2s ease'
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
          Sync Data
        </button>
      </div>

      {/* Sidebar Menu */}
      {showSidebar && (
        <>
          <div 
            className="sidebar-overlay" 
            onClick={() => setShowSidebar(false)}
            style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, backdropFilter: 'blur(4px)'}}
          />
          <div 
            className="sidebar-menu"
            style={{
              position: 'fixed', 
              top: 0, 
              left: 0, 
              bottom: 0, 
              width: '80%', 
              maxWidth: '300px',
              background: '#f8fafc', 
              zIndex: 1001, 
              padding: '0',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '5px 0 25px rgba(0,0,0,0.15)',
              transition: 'transform 0.3s ease-out'
            }}
          >
            <div style={{padding: '30px 20px', background: 'linear-gradient(135deg, #0d9488, #0f766e)', color: 'white'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
                <h2 style={{margin: 0, fontSize: '1.5rem'}}>{t('staff_menu')}</h2>
                <button onClick={() => setShowSidebar(false)} style={{background: 'rgba(255,255,255,0.2)', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'white', width: '32px', height: '32px', borderRadius: '50%'}}>&times;</button>
              </div>
              <p style={{margin: 0, fontSize: '0.85rem', opacity: 0.8}}>{user?.email}</p>
            </div>

            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', padding: '20px', flex: 1}}>
              <button 
                onClick={() => { setShowDeductionModal(true); setShowSidebar(false); }}
                style={{textAlign: 'left', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', color: '#1e293b', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{color: '#0d9488'}}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                {t('report_deduction')}
              </button>


              <div style={{marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '20px'}}>
                <label style={{display: 'block', marginBottom: '12px', fontSize: '0.75rem', color: '#64748b', fontWeight: 'bold', letterSpacing: '0.05em'}}>{t('language').toUpperCase()}</label>
                <div style={{display: 'flex', gap: '10px', background: '#f1f5f9', padding: '4px', borderRadius: '12px'}}>
                  <button 
                    onClick={() => changeLanguage('en')} 
                    style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: language === 'en' ? 'white' : 'transparent', color: language === 'en' ? '#0d9488' : '#64748b', fontWeight: 'bold', boxShadow: language === 'en' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer'}}
                  >English</button>
                  <button 
                    onClick={() => changeLanguage('rw')} 
                    style={{flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: language === 'rw' ? 'white' : 'transparent', color: language === 'rw' ? '#0d9488' : '#64748b', fontWeight: 'bold', boxShadow: language === 'rw' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none', cursor: 'pointer'}}
                  >Rwanda</button>
                </div>
              </div>

              <button 
                onClick={handleLogout}
                style={{marginTop: 'auto', textAlign: 'left', padding: '16px', borderRadius: '12px', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                {t('logout')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
