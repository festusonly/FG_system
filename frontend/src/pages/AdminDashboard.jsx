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
    isOffline,
    deferredPrompt,
    installPWA,
    isPWAInstalled
  } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'
  const [activeTab, setActiveTab] = useState('overview') // 'overview', 'history', 'kitchen', 'settings'
  
  // Safe Notification State
  const [notifPermission, setNotifPermission] = useState(() => {
    try {
      return (typeof window !== 'undefined' && window.Notification) ? window.Notification.permission : 'denied'
    } catch (e) {
      return 'denied'
    }
  })

  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      return localStorage.getItem('admin_notifications_enabled') === 'true'
    } catch (e) {
      return false
    }
  })
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

  const showLocalNotification = (title, body, tag) => {
    if (!notificationsEnabled) return;

    try {
      // Method 1: PWA/Service Worker (Standard for mobile/PWA)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
          registration.showNotification(title, {
            body: body,
            icon: '/icon-512.png',
            badge: '/icon-512.png',
            tag: tag,
            vibrate: [200, 100, 200]
          });
        }).catch(() => {
          // Method 2 Fallback: Browser window (PC)
          if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted') {
            new window.Notification(title, { body, icon: '/icon-512.png' });
          }
        });
      } else if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted') {
        // Method 2 Fallback: Browser window (PC)
        new window.Notification(title, { body, icon: '/icon-512.png' });
      }
    } catch (e) {
      console.error('Notification trigger error:', e);
    }
  }

  // Real-time Notifications Setup
  useEffect(() => {
    // Setup Realtime Channel
    const channel = supabase.channel('admin_notifications')
      .on('postgres_changes', { event: '*', table: 'transactions', schema: 'public' }, (payload) => {
        const tx = payload.new
        const userLabel = tx.served_by ? tx.served_by.split('@')[0] : 'Staff'
        const amount = tx.amount_rwf || tx.amount || 0;
        
        if (payload.eventType === 'INSERT') {
          showLocalNotification(
            `🏨 New Occupation: ${tx.description || 'Room Stay'}`, 
            `${userLabel} recorded RWF ${amount.toLocaleString()}. Room is now Occupied.`, 
            'room-booking'
          )
        } else if (payload.eventType === 'UPDATE' && tx.status === 'completed') {
          showLocalNotification(
            `🗝️ Check-out: ${tx.description || 'Room Stay'}`, 
            `${userLabel} finalized check-out. Room is now Available.`, 
            'room-checkout'
          )
        }
      })
      .on('postgres_changes', { event: 'INSERT', table: 'kitchen_transactions', schema: 'public' }, (payload) => {
        const tx = payload.new
        const userLabel = tx.served_by ? tx.served_by.split('@')[0] : 'Kitchen'
        const typeLabel = tx.type === 'order' ? 'New Order' : 'New Purchase'
        const amount = tx.amount || tx.amount_rwf || 0;
        showLocalNotification(
          `🍳 Kitchen: ${typeLabel}`, 
          `${userLabel} recorded ${tx.description} for RWF ${amount.toLocaleString()}.`, 
          'kitchen-sale'
        )
      })
      .on('postgres_changes', { event: 'INSERT', table: 'expenses', schema: 'public' }, (payload) => {
        const tx = payload.new
        if (tx.description === 'SYSTEM_CASH_COLLECTION' || tx.description === 'KITCHEN_CASH_COLLECTION') return;
        
        const userLabel = (tx.recorded_by || tx.served_by) ? (tx.recorded_by || tx.served_by).split('@')[0] : 'Staff'
        const amount = tx.amount_rwf || tx.amount || 0;
        showLocalNotification(
          `💸 New Expense Alert`, 
          `${userLabel} recorded: ${tx.description} - RWF ${amount.toLocaleString()}.`, 
          'expense-report'
        )
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [t, notificationsEnabled])

  const toggleNotifications = () => {
    try {
      const newState = !notificationsEnabled
      setNotificationsEnabled(newState)
      localStorage.setItem('admin_notifications_enabled', newState)

      if (newState && window.Notification && window.Notification.permission === 'default') {
        window.Notification.requestPermission().then(permission => {
          setNotifPermission(permission)
        })
      }
    } catch (e) {
      console.error('Toggle error:', e)
    }
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
        <div className="header-right-controls">
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
                              {room.status === 'occupied' ? t('utilization_active') : t('utilization_available')}
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
              <div className="modal-summary-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '25px'}}>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('total_clients')}</span>
                  <strong style={{fontSize: '1.25rem', color: '#1e293b'}}>{selectedDayDetails.bookings}</strong>
                </div>
                <div className="modal-stat" style={{background: '#f0f9ff', padding: '15px', borderRadius: '10px', border: '1px solid #e0f2fe'}}>
                  <span style={{fontSize: '0.75rem', color: '#0369a1', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('night_stay')} (Barara)</span>
                  <strong style={{fontSize: '1.25rem', color: '#0c4a6e'}}>
                    {selectedDayDetails.transactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f0fdfa', padding: '15px', borderRadius: '10px', border: '1px solid #ccfbf1'}}>
                  <span style={{fontSize: '0.75rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('short_stay')} (Bataha)</span>
                  <strong style={{fontSize: '1.25rem', color: '#134e4a'}}>
                    {selectedDayDetails.transactions.filter(tx => tx.type === 'short_hours').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('net_profit')}</span>
                  <strong className={selectedDayDetails.net >= 0 ? 'text-primary' : 'text-danger'} style={{fontSize: '1.25rem'}}>
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
                          <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">{t('occupied_short')}</span>}</td>
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
                          <td className="desc-cell"><span className="entry-desc-modern" style={{whiteSpace: 'pre-line', display: 'block', lineHeight: '1.4'}}>{exp.description}</span></td>
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
              <div className="modal-summary-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '25px'}}>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('total_clients')}</span>
                  <strong style={{fontSize: '1.25rem', color: '#1e293b'}}>{shiftTransactions.length}</strong>
                </div>
                <div className="modal-stat" style={{background: '#f0f9ff', padding: '15px', borderRadius: '10px', border: '1px solid #e0f2fe'}}>
                  <span style={{fontSize: '0.75rem', color: '#0369a1', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('night_stay')} (Barara)</span>
                  <strong style={{fontSize: '1.25rem', color: '#0c4a6e'}}>
                    {shiftTransactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f0fdfa', padding: '15px', borderRadius: '10px', border: '1px solid #ccfbf1'}}>
                  <span style={{fontSize: '0.75rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('short_stay')} (Bataha)</span>
                  <strong style={{fontSize: '1.25rem', color: '#134e4a'}}>
                    {shiftTransactions.filter(tx => tx.type === 'short_hours').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>Cash Since Collection</span>
                  <strong className="text-success" style={{fontSize: '1.25rem'}}>RWF {cashOnHand.toLocaleString()}</strong>
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
              <div className="modal-summary-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '25px'}}>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('total_clients')}</span>
                  <strong style={{fontSize: '1.25rem', color: '#1e293b'}}>{todaysTransactions.length}</strong>
                </div>
                <div className="modal-stat" style={{background: '#f0f9ff', padding: '15px', borderRadius: '10px', border: '1px solid #e0f2fe'}}>
                  <span style={{fontSize: '0.75rem', color: '#0369a1', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('night_stay')} (Barara)</span>
                  <strong style={{fontSize: '1.25rem', color: '#0c4a6e'}}>
                    {todaysTransactions.filter(tx => tx.type === 'night' || tx.type === 'many_days').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f0fdfa', padding: '15px', borderRadius: '10px', border: '1px solid #ccfbf1'}}>
                  <span style={{fontSize: '0.75rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('short_stay')} (Bataha)</span>
                  <strong style={{fontSize: '1.25rem', color: '#134e4a'}}>
                    {todaysTransactions.filter(tx => tx.type === 'short_hours').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('net_revenue')}</span>
                  <strong className="text-success" style={{fontSize: '1.25rem'}}>RWF {totalToday.toLocaleString()}</strong>
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
      <div className="settings-card" style={{marginBottom: '1.5rem', border: '2px solid #0d9488', background: '#f0fdfa'}}>
        <h2 style={{color: '#0d9488'}}>🔔 PWA Command Center</h2>
        <p className="settings-subtitle">Manage notifications for this device. Essential for iOS and locked-phone alerts.</p>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
          {/* Status Indicators */}
          <div style={{display: 'flex', gap: '10px', fontSize: '0.85rem', fontWeight: '600'}}>
            <span style={{color: (typeof window !== 'undefined' && window.Notification && Notification.permission === 'granted') ? '#0d9488' : '#e11d48'}}>
              Permission: {(typeof window !== 'undefined' && window.Notification) ? Notification.permission.toUpperCase() : 'UNSUPPORTED'}
            </span>
            <span style={{color: (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? '#0d9488' : '#e11d48'}}>
              Mode: {(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) ? 'APP' : 'BROWSER'}
            </span>
          </div>

          <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
            <button 
              onClick={() => {
                if ('Notification' in window) {
                  Notification.requestPermission().then(permission => {
                    alert(`Notification permission: ${permission}`);
                    window.location.reload();
                  });
                } else {
                  alert('Notifications not supported.');
                }
              }}
              className="btn-save-settings" 
              style={{background: '#0d9488', flex: 1, minWidth: '150px'}}
            >
              1. Enable Alerts
            </button>

            <button 
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification('🔔 PWA Alert Test', {
                      body: 'Success! Your device is ready for live updates.',
                      icon: '/icon-512.png',
                      badge: '/icon-512.png',
                      vibrate: [200, 100, 200]
                    });
                  });
                }
              }}
              className="btn-save-settings" 
              style={{background: '#64748b', flex: 1, minWidth: '150px'}}
            >
              2. Test Pop-up
            </button>
          </div>

          {/iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase()) && !(window.navigator.standalone) && (
             <p style={{fontSize: '0.75rem', color: '#b91c1c', fontWeight: 'bold', background: '#fee2e2', padding: '8px', borderRadius: '8px'}}>
               ⚠️ iOS Warning: Notifications ONLY work if you "Add to Home Screen" first!
             </p>
          )}
        </div>
      </div>

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
      .select('id, role, email')
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
                <strong>{w.email}</strong>
                <span className={`role-badge ${w.role}`} style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: w.role === 'kitchen' ? '#f0fdf4' : '#eff6ff',
                  color: w.role === 'kitchen' ? '#166534' : '#1e40af',
                  fontWeight: '600',
                  marginTop: '4px',
                  display: 'inline-block'
                }}>
                  {w.role === 'kitchen' ? t('kitchen_worker') : t('rooms_worker')}
                </span>
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
  const [selectedDateHistory, setSelectedDateHistory] = useState(null)

  // Auto-Delete logic (Keep database lean)
  React.useEffect(() => {
    const cleanupOldData = async () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      await supabase
        .from('kitchen_transactions')
        .delete()
        .lt('created_at', sevenDaysAgo.toISOString())
    }
    cleanupOldData()
  }, [])

  // 1. Pending Metrics (Since last collection)
  const pendingSales = (kitchenTransactions || [])
    .filter(tx => tx.type === 'order' && new Date(tx.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, tx) => sum + tx.amount, 0)

  const pendingPurchases = (kitchenTransactions || [])
    .filter(tx => tx.type === 'purchase' && new Date(tx.created_at).getTime() > lastKitchenCollectionTime.getTime())
    .reduce((sum, tx) => sum + tx.amount, 0)

  const pendingProfit = pendingSales - pendingPurchases

  // Generate 7-Day History Summary
  const generateKitchenHistory = () => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      const dateStr = d.toDateString()

      const dayTransactions = (kitchenTransactions || []).filter(tx => 
        new Date(tx.created_at).toDateString() === dateStr
      )

      const sales = dayTransactions
        .filter(tx => tx.type === 'order')
        .reduce((sum, tx) => sum + tx.amount, 0)

      const purchases = dayTransactions
        .filter(tx => tx.type === 'purchase')
        .reduce((sum, tx) => sum + tx.amount, 0)

      days.push({
        date: d,
        dateLabel: i === 0 ? t('today') : i === 1 ? t('yesterday') : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        sales,
        purchases,
        transactions: dayTransactions
      })
    }
    return days
  }
  const historyData = generateKitchenHistory()

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
            {isCollecting ? t('loading') : 'Collect Kitchen Profit'}
          </button>
        </div>
      </div>

      <div className="metrics-section" style={{marginBottom: '2rem'}}>
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

      {/* 7-Day Kitchen History Section - DATE ONLY */}
      <div className="panel-section" style={{marginBottom: '2rem'}}>
        <h2>📅 {t('kitchen_history')}</h2>
        <p className="section-subtitle">{t('view_daily_details')}</p>
        
        <div className="history-scroll-x" style={{display: 'flex', gap: '12px', overflowX: 'auto', padding: '15px 0'}}>
          {historyData.map((day, idx) => (
            <div 
              key={idx} 
              className="history-day-card" 
              onClick={() => setSelectedDateHistory(day)}
              style={{
                minWidth: '120px',
                background: 'white',
                padding: '20px 15px',
                borderRadius: '16px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                cursor: 'pointer',
                textAlign: 'center'
              }}
            >
              <div style={{fontWeight: 'bold', color: '#1e293b', fontSize: '1rem'}}>{day.dateLabel}</div>
              <div style={{fontSize: '0.75rem', color: '#64748b', marginTop: '5px'}}>{t('view_details')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* History Detail Modal - CLEAN ROOM STYLE */}
      {selectedDateHistory && (
        <div className="modal-overlay">
          <div className="modal-content-large" style={{
            maxHeight: '85vh', 
            overflowY: 'auto', 
            borderRadius: '12px', 
            background: '#ffffff',
            padding: '0'
          }}>
            <div className="modal-header" style={{
              padding: '20px 24px', 
              borderBottom: '1px solid #f1f5f9',
              background: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{fontSize: '1.25rem', fontWeight: '800', color: '#1e293b'}}>{selectedDateHistory.dateLabel} - {t('detailed_log')}</h2>
              <button className="btn-close-circle" onClick={() => setSelectedDateHistory(null)} style={{background: 'transparent', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#0d9488', fontWeight: 'bold'}}>×</button>
            </div>

            <div style={{padding: '24px'}}>
              <div style={{display: 'flex', gap: '15px', marginBottom: '25px'}}>
                <div style={{flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em'}}>{t('total_sales')}</span>
                  <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginTop: '8px'}}>RWF {selectedDateHistory.sales.toLocaleString()}</div>
                </div>
                <div style={{flex: 1, background: '#f8fafc', padding: '20px', borderRadius: '8px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em'}}>{t('total_purchases')}</span>
                  <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginTop: '8px'}}>RWF {selectedDateHistory.purchases.toLocaleString()}</div>
                </div>
              </div>

              <h3 style={{fontSize: '0.85rem', color: '#0d9488', textTransform: 'uppercase', fontWeight: '700', marginBottom: '15px', marginTop: '10px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{background: '#ccfbf1', padding: '4px 8px', borderRadius: '6px'}}>💰</span> {t('sales_details')}
              </h3>
              <div className="table-responsive" style={{marginBottom: '30px'}}>
                <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{background: '#f0fdfa'}}>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('expense_description')}</th>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('served_by')}</th>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('time')}</th>
                      <th style={{padding: '12px', textAlign: 'right', fontSize: '0.75rem', color: '#0f766e'}}>{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateHistory.transactions.filter(tx => tx.type === 'order').length > 0 ? (
                      selectedDateHistory.transactions.filter(tx => tx.type === 'order').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => (
                        <tr key={tx.id} style={{borderBottom: '1px solid #f1f5f9'}}>
                          <td style={{
                            padding: '12px', 
                            fontWeight: '500', 
                            color: '#1e293b', 
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-line',
                            wordBreak: 'break-word',
                            minWidth: '200px',
                            lineHeight: '1.4'
                          }}>
                            {tx.description}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>
                            {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#0d9488', fontSize: '0.95rem'}}>
                            RWF {tx.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" style={{textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.85rem'}}>{t('no_history')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{fontSize: '0.85rem', color: '#e11d48', textTransform: 'uppercase', fontWeight: '700', marginBottom: '15px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{background: '#fff1f2', padding: '4px 8px', borderRadius: '6px'}}>🛒</span> {t('purchases_details')}
              </h3>
              <div className="table-responsive">
                <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{background: '#fff1f2'}}>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('expense_description')}</th>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('served_by')}</th>
                      <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('time')}</th>
                      <th style={{padding: '12px', textAlign: 'right', fontSize: '0.75rem', color: '#9f1239'}}>{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateHistory.transactions.filter(tx => tx.type === 'purchase').length > 0 ? (
                      selectedDateHistory.transactions.filter(tx => tx.type === 'purchase').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => (
                        <tr key={tx.id} style={{borderBottom: '1px solid #f1f5f9'}}>
                          <td style={{
                            padding: '12px', 
                            fontWeight: '500', 
                            color: '#1e293b', 
                            fontSize: '0.9rem',
                            whiteSpace: 'pre-line',
                            wordBreak: 'break-word',
                            minWidth: '200px',
                            lineHeight: '1.4'
                          }}>
                            {tx.description}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>
                            {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </td>
                          <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#e11d48', fontSize: '0.95rem'}}>
                            - RWF {tx.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" style={{textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '0.85rem'}}>{t('no_history')}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <button 
                className="btn-modal-close" 
                onClick={() => setSelectedDateHistory(null)} 
                style={{
                  marginTop: '30px', 
                  width: '100%', 
                  padding: '14px', 
                  borderRadius: '10px', 
                  background: '#0d9488', 
                  border: 'none', 
                  fontWeight: '700', 
                  color: '#ffffff',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  boxShadow: '0 4px 6px -1px rgba(13, 148, 136, 0.2)'
                }}
              >{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="panel-section">
        <h2 style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          {t('recent_activities')}
          <span style={{fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal'}}>(Today's Top 5)</span>
        </h2>
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
                (kitchenTransactions || [])
                  .filter(tx => new Date(tx.created_at).toDateString() === new Date().toDateString())
                  .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))
                  .slice(0, 5)
                  .map(tx => (
                    <tr key={tx.id}>
                      <td>
                        <span className={`status-badge ${tx.type === 'order' ? 'occupied' : 'completed'}`} style={{fontSize: '0.7rem'}}>
                          {tx.type === 'order' ? t('record_sale') : t('record_purchase')}
                        </span>
                      </td>
                      <td style={{
                        fontWeight: '500',
                        whiteSpace: 'pre-line',
                        wordBreak: 'break-word',
                        lineHeight: '1.4',
                        padding: '12px 1.5rem'
                      }}>{tx.description}</td>
                      <td style={{color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
                      <td className={tx.type === 'order' ? 'text-success' : 'text-danger'} style={{fontWeight: 'bold'}}>
                        {tx.type === 'order' ? '+' : '-'} RWF {tx.amount.toLocaleString()}
                      </td>
                      <td style={{color: '#64748b', fontSize: '0.85rem'}}>
                        {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </td>
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
