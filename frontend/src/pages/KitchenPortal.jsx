import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/KitchenPortal.css'
import '../styles/AdminDashboard.css' // Import for metric-card styles

export default function KitchenPortal() {
  const { user, logout } = useAuth()
  const { kitchenTransactions, lastKitchenCollectionTime, t, language, changeLanguage, isOffline } = useApp()
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
  
  // Metrics Calculations
  const todaysSales = kitchenTransactions
    .filter(t => t.type === 'order' && new Date(t.created_at).toDateString() === todayString)
    .reduce((sum, t) => sum + t.amount, 0)

  const todaysPurchases = kitchenTransactions
    .filter(t => t.type === 'purchase' && new Date(t.created_at).toDateString() === todayString)
    .reduce((sum, t) => sum + t.amount, 0)

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

        {/* Middle: Daily Summary Bar */}
        <div className="daily-summary-bar" style={{marginBottom: '2rem'}}>
           <span className="summary-label">{t('work_done_today')}:</span>
           <span className="summary-val sale">{t('daily_sales')}: RWF {todaysSales.toLocaleString()}</span>
           <span className="summary-val purc">{t('daily_purchases')}: RWF {todaysPurchases.toLocaleString()}</span>
        </div>

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
                      <span className="entry-desc-modern">{entry.description}</span>
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
                      <span className="entry-desc-modern">{entry.description}</span>
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
