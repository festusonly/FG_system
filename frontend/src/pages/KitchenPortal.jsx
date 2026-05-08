import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/KitchenPortal.css'
import '../styles/AdminDashboard.css' // Import for metric-card styles

export default function KitchenPortal() {
  const { user, logout } = useAuth()
  const { kitchenTransactions, lastKitchenCollectionTime, t, language, changeLanguage, isOffline, deferredPrompt, installPWA, isPWAInstalled, refreshData, collectKitchenCash } = useApp()
  const navigate = useNavigate()
  // Sale States
  const [saleDesc, setSaleDesc] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleServedBy, setSaleServedBy] = useState('')
  
  // Simplified Purchase States
  const [purcItems, setPurcItems] = useState([{ desc: '', total: '' }])
  const [showPurcForm, setShowPurcForm] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [selectedDateHistory, setSelectedDateHistory] = useState(null)

  const [message, setMessage] = useState({ type: '', text: '' })

  const todayString = new Date().toDateString()
  
  // 1. Auto-Delete logic (Keep database lean)
  React.useEffect(() => {
    const cleanupOldData = async () => {
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      
      const { error } = await supabase
        .from('kitchen_transactions')
        .delete()
        .lt('created_at', sevenDaysAgo.toISOString())
      
      if (error) console.error('Cleanup error:', error)
    }
    cleanupOldData()
  }, [])

  // 2. Generate 7-Day History Summary
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

  const pendingKitchenCash = kitchenTransactions
    .filter(t => {
      const tTime = new Date(t.created_at).getTime()
      const collTime = lastKitchenCollectionTime.getTime()
      return t.type === 'order' && tTime > collTime
    })
    .reduce((sum, t) => sum + t.amount, 0)

  const recentEntries = kitchenTransactions
    .filter(t => new Date(t.created_at).toDateString() === todayString)
    .slice(0, 20) // Show up to 20 for today
    
  const handleAddItem = (type) => {
    if (type === 'sale') {
      // Sales were reverted to simple state, but just in case
    } else {
      setPurcItems([...purcItems, { desc: '', total: '' }])
    }
  }

  const handleRemoveItem = (type, index) => {
    if (type === 'sale') {
      // Sales were reverted to simple state
    } else {
      const newItems = [...purcItems]
      newItems.splice(index, 1)
      setPurcItems(newItems)
    }
  }

  const handleUpdateItem = (type, index, field, value) => {
    if (type === 'sale') {
      const newItems = [...saleItems]
      newItems[index][field] = value
      setSaleItems(newItems)
    } else {
      const newItems = [...purcItems]
      newItems[index][field] = value
      setPurcItems(newItems)
    }
  }

  const calculateTotal = (items, type) => {
    if (type === 'sale') {
      // For sales, we still use the old logic if needed, but wait, sales was reverted.
      // Actually handleRecordSale was reverted to use saleAmount.
      return 0 
    }
    return items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0)
  }

  const formatDescription = (items, type) => {
    return items.map(i => `${i.desc} (RWF ${i.total})`).join('\n')
  }

  const handleRecordSale = async (e) => {
    e.preventDefault()
    if (!saleDesc || !saleAmount || !saleServedBy) return
    
    setSubmitting(true)
    const { error } = await supabase
      .from('kitchen_transactions')
      .insert([
        { 
          description: saleDesc, 
          amount: parseFloat(saleAmount), 
          served_by: saleServedBy,
          type: 'order', 
          worker_id: user.id 
        }
      ])
    
    setSubmitting(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: t('success_save') })
      setSaleDesc('')
      setSaleAmount('')
      setSaleServedBy('')
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    }
  }

  const handleRecordPurchase = async (e) => {
    e.preventDefault()
    const total = calculateTotal(purcItems, 'purchase')
    if (total <= 0) return
    
    setSubmitting(true)
    const { error } = await supabase
      .from('kitchen_transactions')
      .insert([
        { 
          description: formatDescription(purcItems, 'purchase'), 
          amount: total, 
          type: 'purchase', 
          worker_id: user.id,
          served_by: user.email // Add this for notifications
        }
      ])
    
    setSubmitting(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: t('success_save') })
      setPurcItems([{ desc: '', total: '' }])
      setShowPurcForm(false) // Close form after saving
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleSettleKitchen = async () => {
    const profit = pendingKitchenCash - (kitchenTransactions
      .filter(t => {
        const tTime = new Date(t.created_at).getTime()
        const collTime = lastKitchenCollectionTime.getTime()
        return t.type === 'purchase' && tTime > collTime
      })
      .reduce((sum, t) => sum + t.amount, 0))

    const confirmSettle = window.confirm(
      t('confirm_kitchen_settle', { amount: profit.toLocaleString() })
    )
    
    if (confirmSettle) {
      setSubmitting(true)
      try {
        const result = await collectKitchenCash()
        if (result.success) {
          alert(t('shift_settled_success'))
        } else {
          setMessage({ type: 'error', text: result.error || 'Failed to settle kitchen shift.' })
        }
      } catch (err) {
        setMessage({ type: 'error', text: err.message })
      } finally {
        setSubmitting(false)
      }
    }
  }

  return (
    <div className="kitchen-portal">
      {/* Sidebar Navigation */}
      {showSidebar && <div className="sidebar-overlay" onClick={() => setShowSidebar(false)} />}
      <aside className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{t('kitchen_portal')}</h2>
          <p style={{fontSize: '0.85rem', color: '#64748b', marginTop: '5px'}}>{user?.email}</p>
        </div>

        <div className="sidebar-menu">
          <div className="menu-section">
            <p className="menu-section-label">{t('language')}</p>
            <div className="language-switch" style={{display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px'}}>
              <button 
                onClick={() => { changeLanguage('en'); setShowSidebar(false); }}
                style={{
                  flex: 1,
                  background: language === 'en' ? '#0d9488' : 'transparent', 
                  color: language === 'en' ? 'white' : '#64748b', 
                  border: 'none', 
                  padding: '8px', 
                  borderRadius: '10px', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >English</button>
              <button 
                onClick={() => { changeLanguage('rw'); setShowSidebar(false); }}
                style={{
                  flex: 1,
                  background: language === 'rw' ? '#0d9488' : 'transparent', 
                  color: language === 'rw' ? 'white' : '#64748b', 
                  border: 'none', 
                  padding: '8px', 
                  borderRadius: '10px', 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >Kinyarwanda</button>
            </div>
          </div>

          {deferredPrompt && !isPWAInstalled && (
            <div className="menu-section">
              <p className="menu-section-label">App</p>
              <button 
                onClick={installPWA}
                style={{
                  width: '100%',
                  background: '#f1f5f9',
                  color: '#0d9488',
                  border: '1px solid #e2e8f0',
                  padding: '12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                {t('install_app') || 'Install App'}
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="btn-sidebar-logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
            {t('logout')}
          </button>
        </div>
      </aside>

      <header className="portal-header">
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <button className="hamburger-menu" onClick={() => setShowSidebar(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
          </button>
          <div className="header-content">
            <h1 style={{fontSize: '1.25rem', margin: 0}}>{t('kitchen_portal')}</h1>
          </div>
        </div>
        
        {/* Quick info if needed, or leave empty for cleaner look */}
        <div style={{fontSize: '0.85rem', fontWeight: '600', background: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '20px'}}>
           {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
        </div>
      </header>

      <main className="portal-main">
        {isOffline && (
          <div className="offline-banner" style={{background: '#fffbeb', color: '#b45309', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '800px', margin: '0 auto 2rem auto'}}>
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{color: '#b45309'}}><path d="M5 12s2.545-5 7-5c4.454 0 7 5 7 5s-2.546 5-7 5c-4.455 0-7-5-7-5z"/><circle cx="12" cy="12" r="3"/><path d="m21 21-4.35-4.35"/></svg>
             <div>
               <div style={{fontSize: '1rem'}}>{t('offline_mode')}</div>
               <div style={{fontSize: '0.85rem', fontWeight: 'normal', opacity: 0.9}}>{t('viewing_cached_data')}</div>
             </div>
          </div>
        )}
        {/* Top Metric Row (4 Cards) */}
        <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', maxWidth: '1400px'}}>
           <button 
             onClick={handleSettleKitchen}
             disabled={submitting}
             style={{
               background: '#0d9488',
               color: 'white',
               border: 'none',
               padding: '10px 20px',
               borderRadius: '30px',
               fontWeight: '800',
               cursor: 'pointer',
               boxShadow: '0 4px 10px rgba(13, 148, 136, 0.2)',
               display: 'flex',
               alignItems: 'center',
               gap: '8px'
             }}
           >
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
             {submitting ? t('loading') : (t('start_new_kitchen_shift') || 'Start New Shift')}
           </button>
        </div>

        <div className="metrics-section" style={{marginBottom: '2rem'}}>
          <div className="metric-card" style={{border: '1.5px solid #34d399', background: 'rgba(52, 211, 153, 0.05)'}}>
            <h3>{t('sales_to_collect')}</h3>
            <p className="metric-value">RWF {pendingKitchenCash.toLocaleString()}</p>
          </div>
          <div className="metric-card" style={{border: '1.5px solid #fb7185', background: 'rgba(251, 113, 133, 0.05)'}}>
            <h3>{t('purchases_to_deduct')}</h3>
            <p className="metric-value">RWF {(kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
          </div>
          <div className="metric-card" style={{border: '1.5px solid #2dd4bf', background: 'rgba(45, 212, 191, 0.05)'}}>
            <h3>{t('profit_for_dad')}</h3>
            <p className="metric-value">RWF {(pendingKitchenCash - kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
          </div>

          {/* 4th Card: Purchase Toggle */}
          <div className="metric-card purchase-toggle-card" onClick={() => setShowPurcForm(true)} style={{cursor: 'pointer', border: '1.5px solid #94a3b8', background: 'rgba(148, 163, 184, 0.05)'}}>
             <h3 style={{color: '#475569'}}>{t('record_purchase')}</h3>
             <div className="plus-icon" style={{fontSize: '2rem', margin: '0.5rem 0'}}>+</div>
          </div>
        </div>

        {/* TOP: Record Sale Form (Highest Visibility) */}
        <div className="modern-entry-card">
          <div className="modern-entry-header">
            <h2>{t('record_sale')}</h2>
            <p className="subtitle">{t('money_in')}</p>
          </div>
          <div style={{padding: '2rem'}}>
            <form onSubmit={handleRecordSale} className="entry-form">
              <div className="form-group" style={{marginBottom: '1.5rem'}}>
                <label>{t('what_sold')}</label>
                <textarea 
                  className="modern-textarea"
                  value={saleDesc}
                  onChange={(e) => setSaleDesc(e.target.value)}
                  placeholder="Example: 2 Fish, 5 Beers"
                  required
                />
              </div>
              <div className="form-group" style={{marginBottom: '1.5rem'}}>
                <label>{t('price_rwf')}</label>
                <input 
                  className="modern-input"
                  type="number" 
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  placeholder="Price"
                  required
                />
              </div>
              <div className="form-group" style={{marginBottom: '1.5rem'}}>
                <label>{t('served_by')}</label>
                <input 
                  className="modern-input"
                  type="text" 
                  value={saleServedBy}
                  onChange={(e) => setSaleServedBy(e.target.value)}
                  placeholder="Worker name"
                  required
                />
              </div>
              {message.text && message.text.includes('Sale') && (
                <div className={`portal-msg-large ${message.type}`}>
                  {message.text}
                </div>
              )}
              <button type="submit" className="modern-btn-submit" disabled={submitting}>
                {submitting ? t('loading') : t('save_sale')}
              </button>
            </form>
          </div>
        </div>

        {/* Purchase Modal (Popup for purchases) */}
        {showPurcForm && (
          <div className="modal-overlay">
            <div className="modal-content-pro">
              <div className="modal-header">
                <h2>{t('record_purchase')}</h2>
                <button className="btn-close" onClick={() => setShowPurcForm(false)}>&times;</button>
              </div>
              <form onSubmit={handleRecordPurchase} className="entry-form">
                <div className="line-items-container">
                  {purcItems.map((item, index) => (
                    <div key={index} className="line-item-row" style={{display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center'}}>
                      <input 
                        style={{flex: 2}}
                        type="text" 
                        value={item.desc}
                        onChange={(e) => handleUpdateItem('purchase', index, 'desc', e.target.value)}
                        placeholder={`${t('item_name') || "What?"} (e.g. 2kg Meat)`}
                        required
                        className="large-input"
                      />
                      <input 
                        style={{flex: 1}}
                        type="number" 
                        value={item.total}
                        onChange={(e) => handleUpdateItem('purchase', index, 'total', e.target.value)}
                        placeholder={t('price_paid') || "Price paid"}
                        required
                        className="large-input"
                      />
                      {purcItems.length > 1 && (
                        <button type="button" onClick={() => handleRemoveItem('purchase', index)} style={{background: '#fee2e2', color: '#dc2626', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer'}}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => handleAddItem('purchase')} className="btn-add-item" style={{width: '100%', padding: '12px', background: '#f1f5f9', border: '2px dashed #cbd5e1', borderRadius: '8px', color: '#64748b', fontWeight: 'bold', cursor: 'pointer', marginBottom: '20px'}}>
                    + {t('add_another_item') || "Add another item"}
                  </button>
                </div>

                <div className="form-summary" style={{background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{fontWeight: 'bold', color: '#64748b'}}>{t('total_money_paid') || "Total Money Paid"}:</span>
                    <strong style={{fontSize: '1.25rem', color: '#ef4444'}}>RWF {calculateTotal(purcItems, 'purchase').toLocaleString()}</strong>
                  </div>
                </div>

                {message.text && message.text.includes('Purchase') && (
                  <div className={`portal-msg-large ${message.type}`}>
                    {message.text}
                  </div>
                )}
                <button type="submit" className="btn-submit-pro purchase-theme" disabled={submitting}>
                  {submitting ? t('loading') : t('save_purchase')}
                </button>
              </form>
            </div>
          </div>
        )}


        {/* 7-Day Kitchen History Section - DATE ONLY - MOVED HERE */}
        <div className="kitchen-card-modern" style={{marginBottom: '3rem', maxWidth: '800px', margin: '0 auto 3rem auto'}}>
          <div className="card-header-modern">
            <span className="card-icon">📅</span>
            <div>
              <h2>{t('kitchen_history')}</h2>
              <p>{t('view_daily_details')}</p>
            </div>
          </div>
          
          <div className="history-scroll-x" style={{display: 'flex', gap: '12px', overflowX: 'auto', padding: '10px 0'}}>
            {historyData.map((day, idx) => (
              <div 
                key={idx} 
                className="history-day-card" 
                onClick={() => setSelectedDateHistory(day)}
                style={{
                  minWidth: '110px',
                  background: 'white',
                  padding: '15px 10px',
                  borderRadius: '10px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  cursor: 'pointer',
                  textAlign: 'center'
                }}
              >
                <div style={{fontWeight: 'bold', color: '#1e293b', fontSize: '0.9rem'}}>{day.dateLabel}</div>
                <div style={{fontSize: '0.7rem', color: '#64748b', marginTop: '4px'}}>{t('view_details')}</div>
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
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('order')}</th>
                        <th style={{padding: '12px', textAlign: 'right', fontSize: '0.75rem', color: '#0f766e'}}>{t('amount')}</th>
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('time')}</th>
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#0f766e'}}>{t('served_by')}</th>
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
                  <table className="data-table" style={{width: '100%', borderCollapse: 'collapse'}}>
                    <thead>
                      <tr style={{background: '#fff1f2'}}>
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('order')}</th>
                        <th style={{padding: '12px', textAlign: 'right', fontSize: '0.75rem', color: '#9f1239'}}>{t('amount')}</th>
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('time')}</th>
                        <th style={{padding: '12px', textAlign: 'left', fontSize: '0.75rem', color: '#9f1239'}}>{t('served_by')}</th>
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
                            <td style={{padding: '12px', textAlign: 'right', fontWeight: '700', color: '#0d9488', fontSize: '0.95rem'}}>
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

        <div className="recent-entries-split">
          <div className="entries-column">
            <div className="entries-header">
              <h2>{t('recent_sales')}</h2>
              <p>{t('money_in')}</p>
            </div>
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
                  {recentEntries.filter(e => e.type === 'order').length > 0 ? (
                    recentEntries.filter(e => e.type === 'order').map(entry => (
                      <tr key={entry.id}>
                        <td style={{fontWeight: '500', whiteSpace: 'pre-line', minWidth: '180px'}}>{entry.description}</td>
                        <td style={{color: '#0d9488', fontWeight: 'bold'}}>+ RWF {entry.amount.toLocaleString()}</td>
                        <td style={{color: '#64748b', fontSize: '0.85rem'}}>{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                        <td style={{color: '#64748b', fontSize: '0.85rem'}}>{entry.served_by || '--'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="empty-state">No sales recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="entries-column">
            <div className="entries-header">
              <h2>{t('recent_purchases')}</h2>
              <p>{t('money_out')}</p>
            </div>
            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('order')}</th>
                    <th>{t('amount')}</th>
                    <th>{t('time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.filter(e => e.type === 'purchase').length > 0 ? (
                    recentEntries.filter(e => e.type === 'purchase').map(entry => (
                      <tr key={entry.id}>
                        <td style={{fontWeight: '500', whiteSpace: 'pre-line', minWidth: '180px'}}>{entry.description}</td>
                        <td style={{color: '#0d9488', fontWeight: 'bold'}}>- RWF {entry.amount.toLocaleString()}</td>
                        <td style={{color: '#64748b', fontSize: '0.85rem'}}>{new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="empty-state">{t('no_transactions')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={{textAlign: 'center', marginTop: '3rem', paddingBottom: '2rem'}}>
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
      </main>
    </div>
  )
}
