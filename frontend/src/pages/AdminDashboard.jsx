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
    collectKitchenCash,
    t,
    language,
    changeLanguage,
    isOffline
  } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'history', 'kitchen', 'settings'
  const [notifPermission, setNotifPermission] = useState(Notification.permission)
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

  // Real-time Notifications Setup
  useEffect(() => {
    // Setup Realtime Channel
    const channel = supabase.channel('admin_notifications')
      .on('postgres_changes', { event: 'INSERT', table: 'transactions', schema: 'public' }, (payload) => {
        const tx = payload.new
        if (Notification.permission === 'granted') {
          new Notification(t('new_room_booking'), {
            body: `${tx.description}: RWF ${tx.amount.toLocaleString()}`,
            icon: '/icon-512.png'
          })
        }
      })
      .on('postgres_changes', { event: 'INSERT', table: 'kitchen_transactions', schema: 'public' }, (payload) => {
        const tx = payload.new
        if (Notification.permission === 'granted') {
          new Notification(t('new_kitchen_sale'), {
            body: `${tx.description}: RWF ${tx.amount.toLocaleString()}`,
            icon: '/icon-512.png'
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [t])

  const requestNotifPermission = () => {
    Notification.requestPermission().then(permission => {
      setNotifPermission(permission)
    })
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
          <h1>{t('admin_dashboard')}</h1>
          <p>Owner: {user?.email}</p>
        </div>
        <div className="admin-tabs">
          <button className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>{t('overview')}</button>
          <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>{t('history')}</button>
          <button className={`tab-btn ${activeTab === 'kitchen' ? 'active' : ''}`} onClick={() => setActiveTab('kitchen')}>{t('kitchen')}</button>
          <button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>{t('settings')}</button>
        </div>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
          {notifPermission !== 'granted' && (
            <button 
              onClick={requestNotifPermission}
              style={{background: '#f59e0b', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer'}}
            >
              🔔 {t('allow_notifications')}
            </button>
          )}
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

      <div className="dashboard-content">
        {isOffline && (
          <div className="offline-banner" style={{background: '#fffbeb', color: '#b45309', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.05)'}}>
             <span style={{fontSize: '1.5rem'}}>📡</span>
             <div>
               <div style={{fontSize: '1rem'}}>{t('offline_mode')}</div>
               <div style={{fontSize: '0.85rem', fontWeight: 'normal', opacity: 0.9}}>{t('viewing_cached_data')}</div>
             </div>
          </div>
        )}
        {activeTab === 'overview' && (
          <>
            {/* Cash Collection Banner */}
            <div className="cash-collection-banner">
              <div className="cash-info">
                <h3>{t('cash_in_drawer')}</h3>
                <p>Collected since: {lastCollectionTime.getTime() === 0 ? 'Beginning' : lastCollectionTime.toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}</p>
              </div>
              <div className="cash-action">
                <span className="cash-amount">RWF {cashOnHand.toLocaleString()}</span>
                <button 
                  className="btn-collect" 
                  onClick={handleCollectCash}
                  disabled={cashOnHand === 0}
                >
                  {t('collect_cash')}
                </button>
              </div>
            </div>

            {/* Live Metrics */}
        <div className="metrics-section">
          <div 
            className="metric-card primary clickable"
            onClick={() => scrollToSection('transactions-section')}
          >
            <h3>{t('net_revenue')}</h3>
            <p className="metric-value">RWF {netRevenue.toLocaleString()}</p>
            <span className="metric-label">Total Cash - Expenses</span>
          </div>

          <div 
            className={`metric-card success clickable ${roomFilter === 'available' ? 'active-filter' : ''}`}
            onClick={() => handleRoomFilter('available')}
          >
            <h3>{t('available')}</h3>
            <p className="metric-value">{availableRooms}</p>
            <span className="metric-label">{t('ready_for_booking') || 'Ready for booking'}</span>
          </div>

          <div 
            className={`metric-card warning clickable ${roomFilter === 'occupied' ? 'active-filter' : ''}`}
            onClick={() => handleRoomFilter('occupied')}
          >
            <h3>{t('occupied')}</h3>
            <p className="metric-value">{occupiedRooms}</p>
            <span className="metric-label">{t('currently_in_use') || 'Currently in use'}</span>
          </div>

          <div className="metric-card info">
            <h3>{t('total_clients')}</h3>
            <p className="metric-value">{todaysTransactions.length}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowDailyClientsModal(true)}
            >
              {t('view_details')}
            </button>
          </div>

          <div className="metric-card info">
            <h3>{t('clients_in_shift') || 'Clients in Shift'}</h3>
            <p className="metric-value">{shiftTransactions.length}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowClientsModal(true)}
            >
              {t('view_details')}
            </button>
          </div>

          <div className="metric-card primary">
            <h3>{t('stay_breakdown')}</h3>
            <p className="metric-value breakdown-value">
              <span className="short-stay">{shortStayCount} {t('short_stay')}</span>
              <span className="divider">/</span>
              <span className="night-stay">{nightStayCount} {t('night_stay')}</span>
            </p>
            <span className="metric-label">{t('active_bookings')}</span>
          </div>

          <div className="metric-card danger">
            <h3>{t('total_expenses')}</h3>
            <p className="metric-value">RWF {totalExpenses.toLocaleString()}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowExpensesModal(true)}
            >
              {t('view_details')}
            </button>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Recent Transactions (Moved to main column) */}
          <div className="panel-section" id="transactions-section">
            <h2>{t('recent_transactions')}</h2>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('room')}</th>
                    <th>{t('amount')}</th>
                    <th>{t('type')}</th>
                    <th>{t('time')}</th>
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
                        {t('no_transactions')}
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
              <h2>{t('room_utilization')} {roomFilter !== 'all' && `(${t(roomFilter) || roomFilter})`}</h2>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('room')}</th>
                      <th>{t('status')}</th>
                      <th>{t('usage_count')}</th>
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
                              {room.status === 'occupied' ? t('occupied') : t('available')}
                            </span>
                          </td>
                          <td className="count-cell">{todayUsage} {t('times_today')}</td>
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
            <h2>{t('performance_7day')}</h2>
            <div className="history-grid">
              {historyData.map((day) => (
                <div key={day.date} className="history-card">
                  <div className="history-date">
                    <h3>{t(day.displayDate.toLowerCase()) || day.displayDate}</h3>
                    <span className="history-bookings">{day.bookings} {t('bookings')}</span>
                  </div>
                  <div className="history-metrics">
                    <div className="history-metric text-success">
                      <span>{t('revenue')}</span>
                      <strong>RWF {day.revenue.toLocaleString()}</strong>
                    </div>
                    <div className="history-metric text-danger">
                      <span>{t('expenses')}</span>
                      <strong>RWF {day.expense.toLocaleString()}</strong>
                    </div>
                    <div className={`history-metric ${day.net >= 0 ? 'text-primary' : 'text-danger'}`}>
                      <span>{t('net_profit')}</span>
                      <strong>RWF {day.net.toLocaleString()}</strong>
                    </div>
                  </div>
                  
                  <button className="btn-details" onClick={() => setSelectedDayDetails(day)}>
                    {t('view_details')}
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
              <h2>{t(selectedDayDetails.displayDate.toLowerCase()) || selectedDayDetails.displayDate} - {t('detailed_log')}</h2>
              <button className="modal-close" onClick={() => setSelectedDayDetails(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-summary-grid">
                <div className="modal-stat">
                  <span>{t('bookings')}</span>
                  <strong>{selectedDayDetails.bookings}</strong>
                </div>
                <div className="modal-stat">
                  <span>{t('net_profit')}</span>
                  <strong className={selectedDayDetails.net >= 0 ? 'text-primary' : 'text-danger'}>
                    RWF {selectedDayDetails.net.toLocaleString()}
                  </strong>
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
                          <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">{t('occupied')}</span>}</td>
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
               <button className="btn-modal-close" onClick={() => setSelectedDayDetails(null)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
      {/* Expense Detail Modal */}
      {viewingExpense && (
        <div className="modal-overlay" onClick={() => setViewingExpense(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('total_expenses')}</h2>
              <button className="btn-close" onClick={() => setViewingExpense(null)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-item">
                <span className="detail-label">{t('amount')}</span>
                <span className="detail-value text-danger">RWF {viewingExpense.amount.toLocaleString()}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">{t('expense_description')}</span>
                <p className="detail-text">{viewingExpense.description}</p>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">{t('time')}</span>
                <span className="detail-value">{formatTime(viewingExpense.time)}</span>
              </div>
              
              <div className="detail-item">
                <span className="detail-label">{t('served_by')}</span>
                <span className="detail-value">{viewingExpense.workers?.name || 'Unknown'}</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setViewingExpense(null)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}
      {/* All Expenses List Modal */}
      {showExpensesModal && (
        <div className="modal-overlay" onClick={() => setShowExpensesModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('total_expenses')}</h2>
              <button className="btn-close" onClick={() => setShowExpensesModal(false)}>&times;</button>
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
                <span>{t('confirm')}:</span>
                <strong>RWF {totalExpenses.toLocaleString()}</strong>
              </div>
              <button className="btn-modal-close" onClick={() => setShowExpensesModal(false)}>{t('close')}</button>
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
                  <span>{t('total_clients')}</span>
                  <strong>{todaysTransactions.length}</strong>
                </div>
                <div className="modal-stat">
                  <span>{t('net_revenue')}</span>
                  <strong className="text-success">RWF {totalToday.toLocaleString()}</strong>
                </div>
              </div>

              <h3 className="modal-subtitle">{t('room_utilization')}</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('room')}</th>
                      <th>In</th>
                      <th>Out</th>
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
                        <td colSpan="5" className="empty-state">No clients today yet.</td>
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
  )
}

// Sub-components moved outside to prevent remounting issues
const AdminSettingsSection = ({ user }) => {
  const { updatePassword } = useAuth()
  const { t } = useApp()
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
        <h2>{t('security_settings')}</h2>
        <p className="settings-subtitle">{t('update_password_subtitle')}</p>
        
        <form onSubmit={handlePasswordChange} className="settings-form">
          <div className="form-group">
            <label>{t('new_password')}</label>
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
                {showPassword ? t('close').toLowerCase() : 'Show'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>{t('confirm_password')}</label>
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
            {updating ? t('loading') : t('update_password_btn')}
          </button>
        </form>
      </div>

      <div className="settings-card">
        <h2>{t('staff_access')}</h2>
        <p className="settings-subtitle">{t('staff_access_subtitle')}</p>
        
        <StaffManagementList user={user} />
      </div>
    </div>
  )
}

const StaffManagementList = ({ user }) => {
  const { t } = useApp()
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
                <strong>{t('worker_hint').split(':')[0]}</strong>
                <span>ID: {w.id.substring(0, 8)}...</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">{t('no_transactions')}</p>
      )}

      {selectedWorker && (
        <form onSubmit={handleStaffReset} className="settings-form" style={{marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)'}}>
          <h3>{t('reset_staff_password')}</h3>
          <div className="form-group">
            <label>{t('new_password')}</label>
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
            {reseting ? t('loading') : t('reset_staff_password')}
          </button>
          <button type="button" className="btn-modal-close" onClick={() => setSelectedWorker(null)} style={{marginTop: '0.5rem'}}>
            {t('cancel')}
          </button>
        </form>
      )}
    </div>
  )
}

const KitchenReportSection = ({ kitchenTransactions, lastKitchenCollectionTime }) => {
  const { collectKitchenCash, t } = useApp()
  const [isCollecting, setIsCollecting] = useState(false)

  // 1. Pending Metrics (Since last collection)
  const pendingSales = (kitchenTransactions || [])
    .filter(tx => tx.type === 'order' && new Date(tx.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, tx) => sum + tx.amount, 0)

  const pendingPurchases = (kitchenTransactions || [])
    .filter(tx => tx.type === 'purchase' && new Date(tx.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, tx) => sum + tx.amount, 0)

  const pendingProfit = pendingSales - pendingPurchases

  // 2. History Generation (Last 5 Days)
  const generateHistory = () => {
    const days = []
    for (let i = 0; i < 5; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toDateString()

      const daySales = (kitchenTransactions || [])
        .filter(tx => tx.type === 'order' && new Date(tx.created_at).toDateString() === dateStr)
        .reduce((sum, tx) => sum + tx.amount, 0)

      const dayPurchases = (kitchenTransactions || [])
        .filter(tx => tx.type === 'purchase' && new Date(tx.created_at).toDateString() === dateStr)
        .reduce((sum, tx) => sum + tx.amount, 0)

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
          <h3>{t('profit_for_dad')}</h3>
          <p>{t('since_last_collection')}: {lastKitchenCollectionTime.getTime() === 0 ? t('none') : lastKitchenCollectionTime.toLocaleString()}</p>
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
          <h3>{t('sales_to_collect')}</h3>
          <p className="metric-value">RWF {pendingSales.toLocaleString()}</p>
          <span className="metric-label">Sales since last collection</span>
        </div>
        <div className="metric-card warning">
          <h3>{t('purchases_to_deduct')}</h3>
          <p className="metric-value">RWF {pendingPurchases.toLocaleString()}</p>
          <span className="metric-label">Purchases since last collection</span>
        </div>
        <div className={`metric-card ${pendingProfit >= 0 ? 'primary' : 'danger'}`}>
          <h3>{t('profit_for_dad')}</h3>
          <p className="metric-value">RWF {pendingProfit.toLocaleString()}</p>
          <span className="metric-label">Net profit since collection</span>
        </div>
      </div>

      <div className="panel-section" style={{marginBottom: '2rem'}}>
        <h2>{t('performance_5day_kitchen')}</h2>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('day')}</th>
                <th>{t('daily_sales')}</th>
                <th>{t('daily_purchases')}</th>
                <th>{t('daily_profit')}</th>
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
        <h2>{t('detailed_log')}</h2>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('type')}</th>
                <th>{t('expense_description')}</th>
                <th>{t('served_by')}</th>
                <th>{t('amount')}</th>
                <th>{t('time')}</th>
              </tr>
            </thead>
            <tbody>
              {(kitchenTransactions || []).length > 0 ? (
                (kitchenTransactions || []).map(tx => (
                  <tr key={tx.id}>
                    <td>
                      <span className={`status-badge ${tx.type === 'order' ? 'occupied' : 'completed'}`}>
                        {tx.type === 'order' ? t('record_sale') : t('record_purchase')}
                      </span>
                    </td>
                    <td>{tx.description}</td>
                    <td>{tx.served_by || '--'}</td>
                    <td className={tx.type === 'order' ? 'text-success' : 'text-danger'}>
                      {tx.type === 'order' ? '+' : '-'} RWF {tx.amount.toLocaleString()}
                    </td>
                    <td>{new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">{t('no_transactions')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
