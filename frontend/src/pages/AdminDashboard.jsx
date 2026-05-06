import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import EmployeeManagementSection from '../components/EmployeeManagementSection'
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
    isPWAInstalled,
    refreshData
  } = useApp()
  const navigate = useNavigate()

  const [roomFilter, setRoomFilter] = useState('all') // 'all', 'available', 'occupied'
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('adminActiveTab') || 'overview'
  })

  useEffect(() => {
    localStorage.setItem('adminActiveTab', activeTab)
  }, [activeTab])
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
  const [showOccupiedModal, setShowOccupiedModal] = useState(false)
  const [showAvailableModal, setShowAvailableModal] = useState(false)
  const [activeDetailsTable, setActiveDetailsTable] = useState(null)
  const [showSidebar, setShowSidebar] = useState(false)

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return t('good_morning') || 'Good morning'
    if (hour < 18) return t('good_afternoon') || 'Good afternoon'
    return t('good_evening') || 'Good evening'
  }

  const [showAllHistory, setShowAllHistory] = useState(false)
  const [showAllCollections, setShowAllCollections] = useState(false)
  const [showAllRecentTransactions, setShowAllRecentTransactions] = useState(false)

  useEffect(() => {
    if (activeDetailsTable) {
      const element = document.getElementById('details-section')
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [activeDetailsTable])

  const todayString = new Date().toDateString()
  
  // Filter out system events (markers) from real expenses
  const realExpenses = expenses.filter(exp => 
    exp.description !== 'SYSTEM_CASH_COLLECTION' && 
    exp.description !== 'KITCHEN_CASH_COLLECTION'
  )

  const todaysTransactions = transactions.filter(tx => new Date(tx.time).toDateString() === todayString)
  const todaysExpenses = realExpenses.filter(exp => new Date(exp.time).toDateString() === todayString)

  // Shift Calculations (Since Last Collection)
  const shiftTransactions = transactions.filter(tx => {
    const txTime = new Date(tx.time).getTime()
    const collTime = lastCollectionTime.getTime()
    return txTime > collTime
  })

  // Deduplicated shift list for DISPLAY only (counts & tables).
  // Completed bookings are always shown (a room can be reused in a shift).
  // For active bookings, collapse duplicates per room — keep only the latest.
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

  const shiftExpenses = realExpenses.filter(exp => {
    if (!exp.time) return false;
    const txTime = new Date(exp.time).getTime()
    const collTime = lastCollectionTime ? new Date(lastCollectionTime).getTime() : 0
    return txTime > collTime
  })

  const cashOnHand = shiftTxDeduped.reduce((sum, tx) => sum + tx.amount, 0)
  const totalShiftExpenses = shiftExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  const netCashToCollect = cashOnHand - totalShiftExpenses

  // Computed Metrics (Still needed for history)
  const totalToday = todaysTransactions.reduce((sum, tx) => sum + tx.amount, 0)
  const totalExpensesToday = todaysExpenses.reduce((sum, exp) => sum + exp.amount, 0)
  
  // Active transactions: cross-reference with rooms table to exclude orphans,
  // then deduplicate by room (keep latest per room) to handle race-condition duplicates.
  const allActiveTx = transactions.filter(tx =>
    tx.status === 'active' && rooms.some(r => r.id === tx.roomId && r.status === 'occupied')
  ).sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  const activeTransactions = []
  const seenRoomIds = new Set()
  for (const tx of allActiveTx) {
    if (!seenRoomIds.has(tx.roomId)) {
      seenRoomIds.add(tx.roomId)
      activeTransactions.push(tx)
    }
  }

  // Ground truth: count comes from the rooms table, not transaction count
  const occupiedRooms = rooms.filter(r => r.status === 'occupied').length
  const availableRooms = rooms.filter(r => r.status === 'available').length

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
        displayDate: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${targetDate.getDate()}/${targetDate.getMonth() + 1}`,
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

  // New Collection-to-Collection History Logic
  const generateCollectionHistory = () => {
    const markers = expenses
      .filter(exp => exp.description === 'SYSTEM_CASH_COLLECTION')
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    
    const collectionPeriods = []
    
    for (let i = 0; i < markers.length; i++) {
      const endMarker = markers[i]
      const startMarker = markers[i+1]
      
      const endTime = new Date(endMarker.time)
      const startTime = startMarker ? new Date(startMarker.time) : new Date(0)
      
      // Data in this period
      const periodTx = transactions.filter(tx => {
        const t = new Date(tx.time)
        return t > startTime && t <= endTime
      })
      const periodExp = realExpenses.filter(exp => {
        const t = new Date(exp.time)
        return t > startTime && t <= endTime
      })
      
      const revenue = periodTx.reduce((sum, tx) => sum + tx.amount, 0)
      const expenseValue = periodExp.reduce((sum, exp) => sum + exp.amount, 0)
      
      const formatTime = (date) => {
        if (date.getTime() === 0) return 'Beginning'
        const d = date.getDate()
        const m = date.getMonth() + 1
        const h = date.getHours().toString().padStart(2, '0')
        const min = date.getMinutes().toString().padStart(2, '0')
        return `${d}/${m}, ${h}:${min}`
      }

      collectionPeriods.push({
        id: endMarker.id,
        endTime,
        startTime,
        startLabel: formatTime(startTime),
        endLabel: formatTime(endTime),
        displayDate: `${formatTime(startTime)} → ${formatTime(endTime)}`,
        revenue,
        expense: expenseValue,
        net: revenue - expenseValue,
        bookings: periodTx.length,
        transactions: periodTx,
        isCollection: true
      })
    }
    return collectionPeriods
  }
  const collectionHistoryData = generateCollectionHistory()

  const scrollToSection = (sectionId) => {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleRoomFilter = (type) => {
    setRoomFilter(prev => prev === type ? 'all' : type)
    scrollToSection('room-utilization-section')
  }

  const showLocalNotification = (title, body, tag) => {
    // This is now a simple wrapper for manual/test alerts.
    // Real-time alerts are handled centrally in AppContext.jsx
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: body,
          icon: '/icon-512.png',
          badge: '/icon-512.png',
          tag: tag || 'general',
          vibrate: [200, 100, 200],
          requireInteraction: true
        });
      });
    } else if (window.Notification && Notification.permission === 'granted') {
      new window.Notification(title, { body, icon: '/icon-512.png' });
    }
  }

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
    <div className={`admin-dashboard ${showSidebar ? 'sidebar-open' : ''}`}>
      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button 
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} 
          onClick={() => setActiveTab('overview')}
        >
          <span className="nav-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span className="nav-text">{t('overview')}</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'kitchen' ? 'active' : ''}`} 
          onClick={() => setActiveTab('kitchen')}
        >
          <span className="nav-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 2-2.3 2.3c-.7.7-.7 1.8 0 2.5l2.8 2.8c.7.7 1.8.7 2.5 0L21.4 7.3c.7-.7.7-1.8 0-2.5L19 2.5"/><path d="m11 11 5-5"/><path d="m15 15 5 5"/><path d="m8 16-4.4 4.4c-.8.8-.8 2 0 2.8.8.8 2 .8 2.8 0L10.8 18.8"/><path d="M13 18c.7.7 1.8.7 2.5 0L18 15.5"/><path d="m9.5 14.5 2.5 2.5"/><path d="M5.8 10.3c.7.7 1.8.7 2.5 0l2-2.3"/><path d="M7 14c-2.3 2.3-5.5 2.5-7 1 1.5-1.5 1.3-4.7 3.5-7l4 4Z"/></svg>
          </span>
          <span className="nav-text">{t('kitchen')}</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`} 
          onClick={() => setActiveTab('history')}
        >
          <span className="nav-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
          </span>
          <span className="nav-text">{t('history')}</span>
        </button>
      </div>

      {/* Sidebar Overlay */}
      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}
      
      {/* Sidebar */}
      <aside className={`admin-sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="avatar-large">{user?.email?.[0]?.toUpperCase()}</div>
          <div className="sidebar-user-info">
            <strong>Admin</strong>
            <span>{user?.email}</span>
          </div>
          <button className="btn-close-sidebar" onClick={() => setShowSidebar(false)}>&times;</button>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`sidebar-link ${activeTab === 'overview' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('overview'); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            {t('overview')}
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'kitchen' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('kitchen'); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><line x1="6" x2="18" y1="17" y2="17"/></svg>
            {t('kitchen')}
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'history' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('history'); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
            {t('history')}
          </button>
          <button 
            className={`sidebar-link ${activeTab === 'employees' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('employees'); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {t('employees')}
          </button>
          
          <div className="sidebar-divider"></div>
          
          <button 
            className={`sidebar-link ${activeTab === 'settings' ? 'active' : ''}`} 
            onClick={() => { setActiveTab('settings'); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            {t('settings')}
          </button>
          
          <button 
            className="sidebar-link" 
            onClick={() => { refreshData(); setShowSidebar(false); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{marginRight: '12px'}}><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            {t('sync_data')}
          </button>

          <div className="sidebar-divider"></div>
          
          <div className="sidebar-footer">
            <div className="language-selector-sidebar">
              <span className="lang-label">{t('language')}:</span>
              <div className="lang-btns">
                <button className={language === 'en' ? 'active' : ''} onClick={() => changeLanguage('en')}>EN</button>
                <button className={language === 'rw' ? 'active' : ''} onClick={() => changeLanguage('rw')}>RW</button>
              </div>
            </div>
            <button onClick={logout} className="btn-logout-sidebar">
              <span>🚪</span> {t('logout')}
            </button>
          </div>
        </nav>
      </aside>

      <header className="admin-header-new">
        <button className="btn-avatar" onClick={() => setShowSidebar(true)}>
          {user?.email?.[0]?.toUpperCase() || 'A'}
        </button>
        <h1 className="header-title">{t(activeTab) || 'Home'} <small style={{fontSize: '0.6rem', opacity: 0.5, verticalAlign: 'middle'}}>v1.0.5-notif-fix</small></h1>
        <div className="header-right">
          <div className="header-actions" style={{display: 'flex', gap: '0.75rem', alignItems: 'center'}}>
            <div className="language-switch-header">
              <button 
                className={`lang-btn ${language === 'en' ? 'active' : ''}`}
                onClick={() => changeLanguage('en')}
              >
                EN
              </button>
              <span className="lang-divider">|</span>
              <button 
                className={`lang-btn ${language === 'rw' ? 'active' : ''}`}
                onClick={() => changeLanguage('rw')}
              >
                RW
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-content compact">
        <div className="greeting-section-compact">
          <h2>{getGreeting()}, <span>{user?.email?.split('@')[0]}</span></h2>
        </div>
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
            {/* Cash Collection Banner (Brilliant Teal Area) */}
            <div className="cash-collection-banner">
              <div className="cash-info">
                <h3>{t('cash_in_drawer')}</h3>
                <p>Collected since: {lastCollectionTime.getTime() === 0 ? 'Beginning' : lastCollectionTime.toLocaleString([], {weekday: 'short', hour: '2-digit', minute: '2-digit'})}</p>
              </div>
              <div className="cash-action">
                <span className="cash-amount">RWF {netCashToCollect.toLocaleString()}</span>
                <button 
                  className="btn-collect" 
                  onClick={handleCollectCash}
                  disabled={netCashToCollect === 0}
                >
                  {t('collect_cash')}
                </button>
              </div>
            </div>

            {/* Live Metrics */}
        <div className="metrics-section">
          {/* 1. Net Cash to Collect (Gross - Total money made) */}
          <div className="metric-card" style={{border: '1.5px solid #2dd4bf', background: 'rgba(45, 212, 191, 0.05)'}}>
            <h3>{t('net_cash_to_collect')}</h3>
            <p className="metric-value">RWF {cashOnHand.toLocaleString()}</p>
          </div>

          {/* 3. Client in Shift */}
          <div 
            className={`metric-card clickable ${activeDetailsTable === 'shift' ? 'active-filter' : ''}`}
            onClick={() => setActiveDetailsTable(prev => prev === 'shift' ? null : 'shift')}
            style={{border: '1.5px solid #818cf8', background: 'rgba(129, 140, 248, 0.05)'}}
          >
            <h3>{t('clients_in_shift') || 'Clients in Shift'}</h3>
            <p className="metric-value">{shiftTxDeduped.length}</p>
            <button 
              className="btn-details-card" 
              onClick={(e) => {
                e.stopPropagation();
                setShowClientsModal(true);
              }}
            >
              {t('view_details')}
            </button>
          </div>

          {/* 4. Occupied */}
          <div 
            className={`metric-card clickable ${activeDetailsTable === 'occupied' ? 'active-filter' : ''}`}
            onClick={() => setActiveDetailsTable(prev => prev === 'occupied' ? null : 'occupied')}
            style={{border: '1.5px solid #fb7185', background: 'rgba(251, 113, 133, 0.05)'}}
          >
            <h3>{t('occupied')}</h3>
            <p className="metric-value">{occupiedRooms}</p>
            <button 
              className="btn-details-card" 
              onClick={(e) => {
                e.stopPropagation();
                setShowOccupiedModal(true);
              }}
            >
              {t('view_details')}
            </button>
          </div>

          {/* 5. Available */}
          <div 
            className={`metric-card clickable ${activeDetailsTable === 'available' ? 'active-filter' : ''}`}
            onClick={() => setActiveDetailsTable(prev => prev === 'available' ? null : 'available')}
            style={{border: '1.5px solid #34d399', background: 'rgba(52, 211, 153, 0.05)'}}
          >
            <h3>{t('available')}</h3>
            <p className="metric-value">{availableRooms}</p>
            <button 
              className="btn-details-card" 
              onClick={(e) => {
                e.stopPropagation();
                setShowAvailableModal(true);
              }}
            >
              {t('view_details')}
            </button>
          </div>

          {/* 6. Stay Breakdown */}
          <div className="metric-card" style={{border: '1.5px solid #c084fc', background: 'rgba(192, 132, 252, 0.05)'}}>
            <h3>{t('stay_breakdown')}</h3>
            <p className="metric-value breakdown-value">
              <span className="short-stay">{shortStayCount} {t('short_stay')}</span>
              <span className="divider">/</span>
              <span className="night-stay">{nightStayCount} {t('night_stay')}</span>
            </p>
          </div>

          {/* 7. Shift Expenses */}
          <div className="metric-card" style={{border: '1.5px solid #fbbf24', background: 'rgba(251, 191, 36, 0.05)'}}>
            <h3>{t('total_expenses')}</h3>
            <p className="metric-value" style={{color: '#ef4444'}}>RWF {Number(totalShiftExpenses).toLocaleString()}</p>
            <button 
              className="btn-details-card"
              onClick={() => setShowExpensesModal(true)}
            >
              {t('view_details')}
            </button>
          </div>
        </div>

        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr' }}>
          {/* Recent Transactions (Moved to main column) */}
          <div className="panel-section" id="transactions-section">
            <h2>{t('recent_transactions')}</h2>
            <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table-simple" style={{ minWidth: '500px' }}>
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
                    todaysTransactions.slice(0, showAllRecentTransactions ? undefined : 10).map((tx) => (
                      <tr key={tx.id}>
                        <td className="room-cell">{tx.room}</td>
                        <td className="amount-cell" style={{color: '#0d9488', fontWeight: '700'}}>
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
            {todaysTransactions.length > 10 && (
              <button 
                onClick={() => setShowAllRecentTransactions(!showAllRecentTransactions)}
                style={{width: '100%', marginTop: '1rem', padding: '10px', borderRadius: '12px', border: 'none', background: '#f8fafc', color: '#94a3b8', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', transition: 'all 0.2s'}}
              >
                {showAllRecentTransactions ? t('show_less') || 'Show Less' : `${t('view_more') || 'View More'} (${todaysTransactions.length - 10} more)`}
              </button>
            )}
          </div>
        </div>

        <div id="details-section">
          {activeDetailsTable === 'shift' && (
            <div className="panel-section" style={{ marginTop: '20px' }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                <h2>{t('shift_room_log') || 'Shift Room Log'}</h2>
                <button onClick={() => setActiveDetailsTable(null)} style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b'}}>&times;</button>
              </div>
            <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table-simple" style={{ minWidth: '500px' }}>
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
                        <td className="room-cell">{tx.room}</td>
                        <td>{formatTime(tx.time)}</td>
                        <td>{tx.status === 'completed' ? formatTime(tx.checkoutTime) : <span className="status-badge occupied">{t('occupied_short')}</span>}</td>
                        <td className="amount-cell" style={{color: '#0d9488', fontWeight: '700'}}>RWF {tx.amount.toLocaleString()}</td>
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
        )}

        {activeDetailsTable === 'occupied' && (
          <div className="panel-section" style={{ marginTop: '20px' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
              <h2>{t('active_bookings')}</h2>
              <button onClick={() => setActiveDetailsTable(null)} style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b'}}>&times;</button>
            </div>
            <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table-simple" style={{ minWidth: '500px' }}>
                <thead>
                  <tr>
                    <th>{t('room')}</th>
                    <th>{t('type')}</th>
                    <th>{t('since')}</th>
                    <th>{t('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTransactions.length > 0 ? (
                    activeTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="room-cell">{tx.room}</td>
                        <td>
                          <span className={`status-badge ${tx.type === 'short_hours' ? 'available' : 'occupied'}`} style={{fontSize: '0.7rem'}}>
                            {tx.type === 'short_hours' ? t('short_stay') : t('night_stay')}
                          </span>
                        </td>
                        <td style={{color: '#64748b', fontSize: '0.85rem'}}>{formatTime(tx.time)}</td>
                        <td className="amount-cell" style={{color: '#0d9488', fontWeight: '700'}}>RWF {tx.amount.toLocaleString()}</td>
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
        )}

        {activeDetailsTable === 'available' && (
          <div className="panel-section" style={{ marginTop: '20px' }}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
              <h2>{t('available')} Rooms</h2>
              <button onClick={() => setActiveDetailsTable(null)} style={{background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b'}}>&times;</button>
            </div>
            <div className="table-responsive" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table className="data-table-simple" style={{ minWidth: '300px' }}>
                <thead>
                  <tr>
                    <th>{t('room')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.filter(r => r.status === 'available').length > 0 ? (
                    rooms
                      .filter(r => r.status === 'available')
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}))
                      .map(room => (
                      <tr key={room.id}>
                        <td className="room-cell">{room.name}</td>
                        <td>
                          <span className="status-badge available">{t('utilization_available')}</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="2" className="empty-state">No available rooms</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </div>
      </>
    )}

        {activeTab === 'history' && (
          <div className="history-section">
            <div style={{display: 'flex', flexDirection: 'column', gap: '3rem'}}>
              
              {/* 1. Collection-to-Collection History (SHIFT BASED) */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
                  <h2 style={{margin: 0}}>{t('collection_history') || 'Collection History'}</h2>
                  <p style={{margin: 0, fontSize: '0.85rem', color: '#64748b'}}>{t('period_between_collections') || 'Between cash collections'}</p>
                </div>
                
                <div className="history-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px'}}>
                  {collectionHistoryData.slice(0, showAllCollections ? undefined : 3).map((period) => (
                    <div key={period.id} className="history-card" style={{
                      padding: '16px', 
                      borderRadius: '16px', 
                      border: '1px solid #e2e8f0', 
                      borderLeft: '5px solid #0d9488',
                      background: 'white', 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '15px', 
                      boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                    }}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                        <div style={{background: '#f0f9ff', color: '#0369a1', padding: '8px 12px', borderRadius: '12px', border: '1px solid #e0f2fe', minWidth: '100px'}}>
                          <span style={{display: 'block', fontSize: '0.6rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', opacity: 0.7}}>{t('since_label')}:</span>
                          <strong style={{fontSize: '0.9rem', fontWeight: '900'}}>{period.startLabel}</strong>
                        </div>
                        
                        <div style={{color: '#94a3b8', fontSize: '1.2rem', fontWeight: 'bold'}}>→</div>
                        
                        <div style={{background: '#f0f9ff', color: '#0369a1', padding: '8px 12px', borderRadius: '12px', border: '1px solid #e0f2fe', minWidth: '100px'}}>
                          <span style={{display: 'block', fontSize: '0.6rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px', opacity: 0.7}}>{t('to_label')}:</span>
                          <strong style={{fontSize: '0.9rem', fontWeight: '900'}}>{period.endLabel}</strong>
                        </div>
                      </div>
                      
                        <button 
                          onClick={() => setSelectedDayDetails(period)}
                          style={{padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#0f766e', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer', transition: 'background 0.2s'}}
                        >
                          {t('view_details')}
                        </button>
                    </div>
                  ))}
                </div>
                
                {collectionHistoryData.length > 6 && (
                  <button 
                    onClick={() => setShowAllCollections(!showAllCollections)}
                    style={{width: '100%', marginTop: '1.5rem', padding: '12px', borderRadius: '12px', border: 'none', background: '#0d9488', color: 'white', cursor: 'pointer', fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(13, 148, 136, 0.2)'}}
                  >
                    {showAllCollections ? t('show_less') || 'Show Less' : `${t('view_more') || 'View More'} (${collectionHistoryData.length - 3} more)`}
                  </button>
                )}
              </div>

              {/* 2. Standard Daily History */}
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem'}}>
                  <h2 style={{margin: 0}}>{t('performance_7day')}</h2>
                  <p style={{margin: 0, fontSize: '0.85rem', color: '#64748b'}}>{t('standard_calendar_days') || 'Standard calendar days'}</p>
                </div>
                
                <div className="history-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px'}}>
                  {historyData.slice(0, showAllHistory ? undefined : 3).map((day) => (
                    <div key={day.date} className="history-card" style={{
                      padding: '16px', 
                      borderRadius: '16px', 
                      border: '1px solid #e2e8f0', 
                      borderLeft: '5px solid #64748b',
                      background: 'white', 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '15px', 
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                    }}>
                      <div>
                        <div style={{display: 'inline-block', background: '#f8fafc', color: '#475569', padding: '6px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '4px'}}>
                          <h3 style={{margin: 0, fontSize: '1rem', fontWeight: '900'}}>{t(day.displayDate.toLowerCase()) || day.displayDate}</h3>
                        </div>
                      </div>
                      
                        <button 
                          onClick={() => setSelectedDayDetails(day)}
                          style={{padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: '0.8rem', fontWeight: '800', cursor: 'pointer'}}
                        >
                          {t('view_details')}
                        </button>
                    </div>
                  ))}
                </div>

                {historyData.length > 6 && (
                  <button 
                    onClick={() => setShowAllHistory(!showAllHistory)}
                    style={{width: '100%', marginTop: '1.5rem', padding: '12px', borderRadius: '12px', border: 'none', background: '#0d9488', color: 'white', cursor: 'pointer', fontWeight: '800', fontSize: '0.85rem', transition: 'all 0.2s', boxShadow: '0 4px 6px -1px rgba(13, 148, 136, 0.2)'}}
                  >
                    {showAllHistory ? t('show_less') || 'Show Less' : t('view_more')}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}
        {activeTab === 'kitchen' && (
          <KitchenReportSection 
            kitchenTransactions={kitchenTransactions} 
            lastKitchenCollectionTime={lastKitchenCollectionTime}
          />
        )}
        {activeTab === 'employees' && <EmployeeManagementSection user={user} />}
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
                  <strong style={{fontSize: '1.25rem', color: '#0d9488'}}>
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
                          <td style={{color: '#0d9488', fontWeight: '700'}}>RWF {tx.amount.toLocaleString()}</td>
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
                <span className="detail-value" style={{color: '#ef4444', fontWeight: '700'}}>RWF {viewingExpense.amount.toLocaleString()}</span>
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
                    {shiftExpenses.length > 0 ? (
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
                <strong>RWF {Number(totalShiftExpenses).toLocaleString()}</strong>
              </div>
              <button className="btn-modal-close" onClick={() => setShowExpensesModal(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}



      {/* Today's Client Usage Modal */}
      {showClientsModal && (
        <div className="modal-overlay" onClick={() => setShowClientsModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('shift_usage_breakdown') || 'Today\'s Room Usage Breakdown'}</h2>
              <button className="btn-close" onClick={() => setShowClientsModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="modal-summary-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '25px'}}>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('total_clients')}</span>
                  <strong style={{fontSize: '1.25rem', color: '#1e293b'}}>{shiftTxDeduped.length}</strong>
                </div>
                <div className="modal-stat" style={{background: '#f0f9ff', padding: '15px', borderRadius: '10px', border: '1px solid #e0f2fe'}}>
                  <span style={{fontSize: '0.75rem', color: '#0369a1', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('night_stay')} (Barara)</span>
                  <strong style={{fontSize: '1.25rem', color: '#0c4a6e'}}>
                    {shiftTxDeduped.filter(tx => tx.type === 'night' || tx.type === 'many_days').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f0fdfa', padding: '15px', borderRadius: '10px', border: '1px solid #ccfbf1'}}>
                  <span style={{fontSize: '0.75rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('short_stay')} (Bataha)</span>
                  <strong style={{fontSize: '1.25rem', color: '#134e4a'}}>
                    {shiftTxDeduped.filter(tx => tx.type === 'short_hours').length}
                  </strong>
                </div>
                <div className="modal-stat" style={{background: '#f8fafc', padding: '15px', borderRadius: '10px', border: '1px solid #f1f5f9'}}>
                  <span style={{fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('cash_since_collection') || 'Cash Since Collection'}</span>
                  <strong className="text-success" style={{fontSize: '1.25rem'}}>RWF {cashOnHand.toLocaleString()}</strong>
                </div>
              </div>

              <h3 className="modal-subtitle" style={{marginBottom: '15px'}}>{t('shift_room_log') || 'Shift Room Log'}</h3>
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
              <button className="btn-modal-close" onClick={() => setShowClientsModal(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Occupied Details Modal */}
      {showOccupiedModal && (
        <div className="modal-overlay" onClick={() => setShowOccupiedModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('occupied')} - {t('detailed_log')}</h2>
              <button className="btn-close" onClick={() => setShowOccupiedModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-summary-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginBottom: '25px'}}>
                <div className="modal-stat" style={{background: '#f0f9ff', padding: '15px', borderRadius: '10px', border: '1px solid #e0f2fe'}}>
                  <span style={{fontSize: '0.75rem', color: '#0369a1', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('night_stay')} (Barara)</span>
                  <strong style={{fontSize: '1.25rem', color: '#0c4a6e'}}>{nightStayCount}</strong>
                </div>
                <div className="modal-stat" style={{background: '#f0fdfa', padding: '15px', borderRadius: '10px', border: '1px solid #ccfbf1'}}>
                  <span style={{fontSize: '0.75rem', color: '#0f766e', textTransform: 'uppercase', fontWeight: '700', display: 'block', marginBottom: '5px'}}>{t('short_stay')} (Bataha)</span>
                  <strong style={{fontSize: '1.25rem', color: '#134e4a'}}>{shortStayCount}</strong>
                </div>
              </div>

              <h3 className="modal-subtitle" style={{marginBottom: '15px'}}>{t('active_bookings')}</h3>
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('room')}</th>
                      <th>{t('type')}</th>
                      <th>{t('since')}</th>
                      <th>{t('amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTransactions.length > 0 ? (
                      activeTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td><strong>{tx.room}</strong></td>
                          <td>
                            <span className={`status-badge ${tx.type === 'short_hours' ? 'available' : 'occupied'}`} style={{fontSize: '0.7rem'}}>
                              {tx.type === 'short_hours' ? t('short_stay') : t('night_stay')}
                            </span>
                          </td>
                          <td style={{color: '#64748b', fontSize: '0.85rem'}}>{formatTime(tx.time)}</td>
                          <td style={{color: '#0d9488', fontWeight: '700'}}>RWF {tx.amount.toLocaleString()}</td>
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
              <button className="btn-modal-close" onClick={() => setShowOccupiedModal(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Available Details Modal */}
      {showAvailableModal && (
        <div className="modal-overlay" onClick={() => setShowAvailableModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('available')} Rooms</h2>
              <button className="btn-close" onClick={() => setShowAvailableModal(true)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('room')}</th>
                      <th>{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.filter(r => r.status === 'available').length > 0 ? (
                      rooms
                        .filter(r => r.status === 'available')
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true}))
                        .map(room => (
                        <tr key={room.id}>
                          <td className="room-cell">{room.name}</td>
                          <td>
                            <span className="status-badge available">{t('utilization_available')}</span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan="2" className="empty-state">No available rooms</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setShowAvailableModal(false)}>{t('close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Full Client Log Modal */}
      {showDailyClientsModal && (
        <div className="modal-overlay" onClick={() => setShowDailyClientsModal(false)}>
          <div className="modal-content modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('todays_client_log')}</h2>
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
                  <strong style={{fontSize: '1.25rem', color: '#0d9488'}}>RWF {totalToday.toLocaleString()}</strong>
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
                          <td style={{color: '#0d9488', fontWeight: '700'}}>RWF {tx.amount.toLocaleString()}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="empty-state">{t('no_clients_today')}</td>
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
  const { t, undoLastCollection, undoLastKitchenCollection, refreshData } = useApp()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [isUndoing, setIsUndoing] = useState(false)
  const [msg, setMsg] = useState({ type: '', text: '' })

  const handleUndoRoom = async () => {
    if (window.confirm(t('confirm_undo'))) {
      setIsUndoing(true)
      const res = await undoLastCollection()
      setIsUndoing(false)
      if (res.success) {
        alert(t('success_save'))
        refreshData()
      } else {
        alert(res.error)
      }
    }
  }

  const handleUndoKitchen = async () => {
    if (window.confirm(t('confirm_undo'))) {
      setIsUndoing(true)
      const res = await undoLastKitchenCollection()
      setIsUndoing(false)
      if (res.success) {
        alert(t('success_save'))
        refreshData()
      } else {
        alert(res.error)
      }
    }
  }

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
                    if (Notification.permission === 'denied') {
                      alert('🛑 Notifications are BLOCKED by your browser. Please click the "Lock" icon in the address bar and set Notifications to "Allow", then reload the page.');
                      return;
                    }
                    Notification.requestPermission().then(permission => {
                      if (permission === 'granted') {
                        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                          navigator.serviceWorker.controller.postMessage({
                            type: 'SHOW_NOTIFICATION',
                            title: '🔔 Alerts Enabled',
                            body: 'You will now receive live updates on this device.'
                          });
                        } else {
                          new Notification('🔔 Alerts Enabled', { body: 'Ready for live updates!' });
                        }
                      }
                      window.location.reload();
                    });
                  }
                }}
                className="btn-save-settings" 
                style={{background: Notification.permission === 'denied' ? '#ef4444' : '#0d9488', flex: 1, minWidth: '150px'}}
              >
                {Notification.permission === 'denied' ? '1. Alerts are Blocked' : '1. Enable Alerts'}
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

          <p style={{fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', marginTop: '0.5rem'}}>
            💡 Tip: If you don't hear a sound, check if your phone/PC is in "Do Not Disturb" or "Focus Mode".
          </p>
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

      <div className="settings-card" style={{marginTop: '2rem', border: '1.5px solid #64748b', background: '#f8fafc'}}>
        <h2 style={{color: '#475569'}}>🛠️ Maintenance & Recovery</h2>
        <p className="settings-subtitle">Undo accidental shift resets or cash collections.</p>
        
        <div style={{display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem'}}>
          <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
            <button 
              className="btn-save-settings" 
              style={{background: '#64748b', flex: 1, minWidth: '200px'}}
              onClick={handleUndoRoom}
              disabled={isUndoing}
            >
              {isUndoing ? t('loading') : t('undo_collection')}
            </button>
            <button 
              className="btn-save-settings" 
              style={{background: '#94a3b8', flex: 1, minWidth: '200px'}}
              onClick={handleUndoKitchen}
              disabled={isUndoing}
            >
              {isUndoing ? t('loading') : t('undo_kitchen_collection')}
            </button>
          </div>
          <p style={{fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic'}}>
            💡 This will delete the last "Collection" record and restore the previous balance.
          </p>
        </div>
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
    // We allow collection even if negative to "settle" the period
    const profitLabel = pendingProfit >= 0 ? `RWF ${pendingProfit.toLocaleString()} (Net Profit)` : `RWF ${pendingProfit.toLocaleString()} (Net Loss)`;
    
    if (window.confirm(`Settle kitchen account with ${profitLabel}? This will mark current transactions as collected.`)) {
      setIsCollecting(true)
      try {
        const res = await collectKitchenCash()
        if (res.success) {
          alert('Kitchen account settled successfully!')
        } else {
          alert('Error: ' + (res.error || 'Failed to settle account'))
        }
      } catch (err) {
        alert('Error: ' + err.message)
      } finally {
        setIsCollecting(false)
      }
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
          <span className="cash-amount" style={{color: '#ffffff'}}>RWF {pendingProfit.toLocaleString()}</span>
          <button 
            className="btn-collect" 
            onClick={handleCollect}
            disabled={isCollecting}
          >
            {isCollecting ? t('loading') : t('collect_cash')}
          </button>
        </div>
      </div>

      <div className="metrics-section" style={{marginBottom: '2rem'}}>
        <div className="metric-card" style={{border: '1.5px solid #34d399', background: 'rgba(52, 211, 153, 0.05)'}}>
          <h3>{t('sales_to_collect')}</h3>
          <p className="metric-value" style={{color: '#0d9488'}}>RWF {pendingSales.toLocaleString()}</p>
        </div>
        <div className="metric-card" style={{border: '1.5px solid #fb7185', background: 'rgba(251, 113, 133, 0.05)'}}>
          <h3>{t('purchases_to_deduct')}</h3>
          <p className="metric-value" style={{color: '#ef4444'}}>RWF {pendingPurchases.toLocaleString()}</p>
        </div>
        <div className="metric-card" style={{border: '1.5px solid #2dd4bf', background: 'rgba(45, 212, 191, 0.05)'}}>
          <h3>{t('profit_for_dad')}</h3>
          <p className="metric-value" style={{color: '#0d9488'}}>RWF {pendingProfit.toLocaleString()}</p>
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
                background: 'rgba(16, 185, 129, 0.05)',
                padding: '20px 15px',
                borderRadius: '10px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.07)',
                cursor: 'pointer',
                textAlign: 'center',
                border: '1.5px solid #10b981',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{fontWeight: 'bold', color: '#1e293b', fontSize: '1rem'}}>{day.dateLabel}</div>
              <button className="btn-details-card" style={{marginTop: '10px', fontSize: '0.7rem', padding: '4px 10px'}}>
                {t('view_details')}
              </button>
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
            borderRadius: '20px', 
            background: '#ffffff',
            padding: '0',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
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
                <div style={{flex: 1, background: 'rgba(52, 211, 153, 0.05)', padding: '20px', borderRadius: '16px', border: '1.5px solid #34d399', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'}}>
                  <span style={{fontSize: '0.7rem', color: '#059669', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em'}}>{t('total_sales')}</span>
                  <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#0d9488', marginTop: '8px'}}>RWF {selectedDateHistory.sales.toLocaleString()}</div>
                </div>
                <div style={{flex: 1, background: 'rgba(251, 113, 133, 0.05)', padding: '20px', borderRadius: '16px', border: '1.5px solid #fb7185', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'}}>
                  <span style={{fontSize: '0.7rem', color: '#e11d48', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em'}}>{t('total_purchases')}</span>
                  <div style={{fontSize: '1.5rem', fontWeight: '800', color: '#ef4444', marginTop: '8px'}}>RWF {selectedDateHistory.purchases.toLocaleString()}</div>
                </div>
              </div>

              <h3 style={{fontSize: '0.85rem', color: '#0d9488', textTransform: 'uppercase', fontWeight: '700', marginBottom: '15px', marginTop: '10px', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px'}}>
                <span style={{background: '#ccfbf1', padding: '4px 8px', borderRadius: '6px'}}>💰</span> {t('sales_details')}
              </h3>
              <div className="table-responsive" style={{marginBottom: '30px'}}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('order')}</th>
                      <th className="text-right">{t('amount')}</th>
                      <th>{t('time')}</th>
                      <th>{t('served_by')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateHistory.transactions.filter(tx => tx.type === 'order').length > 0 ? (
                      selectedDateHistory.transactions.filter(tx => tx.type === 'order').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => (
                        <tr key={tx.id}>
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
                          <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#0d9488', fontSize: '0.95rem'}}>
                            RWF {tx.amount.toLocaleString()}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>
                            {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
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
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('order')}</th>
                      <th className="text-right">{t('amount')}</th>
                      <th>{t('time')}</th>
                      <th>{t('served_by')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDateHistory.transactions.filter(tx => tx.type === 'purchase').length > 0 ? (
                      selectedDateHistory.transactions.filter(tx => tx.type === 'purchase').sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(tx => (
                        <tr key={tx.id}>
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
                          <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#ef4444', fontSize: '0.95rem'}}>
                            - RWF {tx.amount.toLocaleString()}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>
                            {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
                          </td>
                          <td style={{padding: '12px', color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
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
                <th>{t('order')}</th>
                <th>{t('amount')}</th>
                <th>{t('time')}</th>
                <th>{t('served_by')}</th>
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
                      <td style={{
                        fontWeight: '500',
                        whiteSpace: 'pre-line',
                        wordBreak: 'break-word',
                        lineHeight: '1.4',
                        padding: '12px 1.5rem'
                      }}>{tx.description}</td>
                      <td style={{color: '#0d9488', fontWeight: 'bold'}}>
                        {tx.type === 'order' ? '+' : '-'} RWF {tx.amount.toLocaleString()}
                      </td>
                      <td style={{color: '#64748b', fontSize: '0.85rem'}}>
                        {new Date(tx.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </td>
                      <td style={{color: '#64748b', fontSize: '0.85rem'}}>{tx.served_by || '--'}</td>
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
