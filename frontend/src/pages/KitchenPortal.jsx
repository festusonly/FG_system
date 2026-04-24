import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/KitchenPortal.css'
import '../styles/AdminDashboard.css' // Import for metric-card styles

export default function KitchenPortal() {
  const { user, logout } = useAuth()
  const { kitchenTransactions, lastKitchenCollectionTime, t, language, changeLanguage, isOffline, deferredPrompt, installPWA, isPWAInstalled } = useApp()
  const navigate = useNavigate()
  // Sale States
  const [saleDesc, setSaleDesc] = useState('')
  const [saleAmount, setSaleAmount] = useState('')
  const [saleServedBy, setSaleServedBy] = useState('')
  
  // Purchase States
  const [purcDesc, setPurcDesc] = useState('')
  const [purcAmount, setPurcAmount] = useState('')
  const [showPurcForm, setShowPurcForm] = useState(false)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })

  const todayString = new Date().toDateString()
  
  const [selectedDateHistory, setSelectedDateHistory] = useState(null)

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

  const handleRecordSale = async (e) => {
    e.preventDefault()
    if (!saleDesc || !saleAmount || !saleServedBy) return
    
    setLoading(true)
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
    
    setLoading(false)

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
    if (!purcDesc || !purcAmount) return
    
    setLoading(true)
    const { error } = await supabase
      .from('kitchen_transactions')
      .insert([
        { 
          description: purcDesc, 
          amount: parseFloat(purcAmount), 
          type: 'purchase', 
          worker_id: user.id,
          served_by: user.email // Add this for notifications
        }
      ])
    
    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: t('success_save') })
      setPurcDesc('')
      setPurcAmount('')
      setShowPurcForm(false) // Close form after saving
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="kitchen-portal">
      <header className="portal-header">
        <div className="header-content">
          <h1>{t('kitchen_portal')}</h1>
          <p>Worker: {user?.email}</p>
        </div>
        <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
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
          <button onClick={handleLogout} className="btn-logout">{t('logout')}</button>
        </div>
      </header>

      <main className="portal-main">
        {isOffline && (
          <div className="offline-banner" style={{background: '#fffbeb', color: '#b45309', padding: '1rem', borderRadius: '12px', marginBottom: '2rem', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: '600', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', maxWidth: '800px', margin: '0 auto 2rem auto'}}>
             <span style={{fontSize: '1.5rem'}}>📡</span>
             <div>
               <div style={{fontSize: '1rem'}}>{t('offline_mode')}</div>
               <div style={{fontSize: '0.85rem', fontWeight: 'normal', opacity: 0.9}}>{t('viewing_cached_data')}</div>
             </div>
          </div>
        )}
        {/* Top Metric Row (4 Cards) */}
        <div className="metrics-section" style={{marginBottom: '2rem'}}>
          <div className="metric-card success">
            <h3>{t('sales_to_collect')}</h3>
            <p className="metric-value">RWF {pendingKitchenCash.toLocaleString()}</p>
            <span className="metric-label">{t('since_last_collection')}</span>
          </div>
          <div className="metric-card warning">
            <h3>{t('purchases_to_deduct')}</h3>
            <p className="metric-value">RWF {(kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
            <span className="metric-label">{t('since_last_collection')}</span>
          </div>
          <div className={`metric-card ${(pendingKitchenCash - kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)) >= 0 ? 'primary' : 'danger'}`}>
            <h3>{t('profit_for_dad')}</h3>
            <p className="metric-value">RWF {(pendingKitchenCash - kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
            <span className="metric-label">{t('since_last_collection')}</span>
          </div>

          {/* 4th Card: Purchase Toggle */}
          <div className="metric-card purchase-toggle-card" onClick={() => setShowPurcForm(true)} style={{cursor: 'pointer', border: '2px dashed #475569'}}>
             <h3 style={{color: '#475569'}}>{t('record_purchase')}</h3>
             <div className="plus-icon" style={{fontSize: '2rem', margin: '0.5rem 0'}}>+</div>
             <span className="metric-label">{t('view_details')}</span>
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
                <div className="form-group">
                  <label>{t('what_bought')}</label>
                  <textarea 
                    value={purcDesc}
                    onChange={(e) => setPurcDesc(e.target.value)}
                    placeholder="Meat, Oil, etc."
                    required
                    className="large-input"
                  />
                </div>
                <div className="form-group">
                  <label>{t('price_rwf')}</label>
                  <input 
                    type="number" 
                    value={purcAmount}
                    onChange={(e) => setPurcAmount(e.target.value)}
                    placeholder="Price"
                    required
                    className="large-input"
                  />
                </div>
                {message.text && message.text.includes('Purchase') && (
                  <div className={`portal-msg-large ${message.type}`}>
                    {message.text}
                  </div>
                )}
                <button type="submit" className="btn-submit-pro purchase-theme" disabled={loading}>
                  {loading ? t('loading') : t('save_purchase')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Bottom: Isolated Sale Form */}
        <div className="entry-card sale-card-pro" style={{maxWidth: '800px', margin: '0 auto 3rem auto'}}>
          <div className="entry-header">
            <h2>{t('record_sale')}</h2>
            <p className="subtitle">{t('money_in')}</p>
          </div>
          <form onSubmit={handleRecordSale} className="entry-form">
            <div className="form-group">
              <label>{t('what_sold')}</label>
              <textarea 
                value={saleDesc}
                onChange={(e) => setSaleDesc(e.target.value)}
                placeholder="Example: 2 Fish, 5 Beers"
                required
                className="large-input"
              />
            </div>
            <div className="form-group-row">
              <div className="form-group">
                <label>{t('price_rwf')}</label>
                <input 
                  type="number" 
                  value={saleAmount}
                  onChange={(e) => setSaleAmount(e.target.value)}
                  placeholder="Price"
                  required
                  className="large-input"
                />
              </div>
              <div className="form-group">
                <label>{t('served_by')}</label>
                <input 
                  type="text" 
                  value={saleServedBy}
                  onChange={(e) => setSaleServedBy(e.target.value)}
                  placeholder="Worker name"
                  required
                  className="large-input"
                />
              </div>
            </div>
            {message.text && message.text.includes('Sale') && (
              <div className={`portal-msg-large ${message.type}`}>
                {message.text}
              </div>
            )}
            <button type="submit" className="btn-submit-pro sale-theme" disabled={loading}>
              {loading ? t('loading') : t('save_sale')}
            </button>
          </form>
        </div>

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
                  borderRadius: '16px',
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

        <div className="recent-entries-split">
          <div className="entries-column">
            <div className="entries-header">
              <h2>{t('recent_sales')}</h2>
              <p>{t('money_in')}</p>
            </div>
            <div className="entries-list">
              {recentEntries.filter(e => e.type === 'order').length > 0 ? (
                recentEntries.filter(e => e.type === 'order').map(entry => (
                  <div key={entry.id} className="entry-item-modern order">
                    <div className="entry-main-info">
                      <div className="entry-top">
                        <span className="entry-time-modern">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="entry-desc-modern" style={{whiteSpace: 'pre-line', display: 'block', lineHeight: '1.4'}}>{entry.description}</span>
                      <div className="entry-sub-info">
                        {entry.served_by && <span className="entry-served-by">{t('served_by')}: <strong>{entry.served_by}</strong></span>}
                      </div>
                    </div>
                    <div className="entry-price-info">
                      <span className="entry-amount-modern">+ RWF {entry.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-state">No sales recorded yet.</p>
              )}
            </div>
          </div>

          <div className="entries-column">
            <div className="entries-header">
              <h2>{t('recent_purchases')}</h2>
              <p>{t('money_out')}</p>
            </div>
            <div className="entries-list">
              {recentEntries.filter(e => e.type === 'purchase').length > 0 ? (
                recentEntries.filter(e => e.type === 'purchase').map(entry => (
                  <div key={entry.id} className="entry-item-modern purchase">
                    <div className="entry-main-info">
                      <div className="entry-top">
                        <span className="entry-time-modern">
                          {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="entry-desc-modern" style={{whiteSpace: 'pre-line', display: 'block', lineHeight: '1.4'}}>{entry.description}</span>
                    </div>
                    <div className="entry-price-info">
                      <span className="entry-amount-modern">- RWF {entry.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-state">{t('no_transactions')}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
