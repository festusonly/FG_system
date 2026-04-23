import React, { useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import '../styles/KitchenPortal.css'
import '../styles/AdminDashboard.css' // Import for metric-card styles

export default function KitchenPortal() {
  const { user, logout } = useAuth()
  const { kitchenTransactions, lastKitchenCollectionTime } = useApp()
  const navigate = useNavigate()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [servedBy, setServedBy] = useState('')
  const [type, setType] = useState('order') // 'order' or 'purchase'
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

  const recentEntries = kitchenTransactions.slice(0, 10)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!description || !amount) return
    
    setLoading(true)
    const { error } = await supabase
      .from('kitchen_transactions')
      .insert([
        { 
          description, 
          amount: parseFloat(amount), 
          served_by: type === 'order' ? servedBy : null,
          type, 
          worker_id: user.id 
        }
      ])
    
    setLoading(false)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: type === 'order' ? 'Sale Saved!' : 'Purchase Saved!' })
      setDescription('')
      setAmount('')
      setServedBy('')
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
          <h1>Kitchen Portal</h1>
          <p>Worker: {user?.email}</p>
        </div>
        <button onClick={handleLogout} className="btn-logout">Logout</button>
      </header>

      <main className="portal-main">
        {/* Main Collection Metrics */}
        <div className="metrics-section" style={{marginBottom: '1rem'}}>
          <div className="metric-card success">
            <h3>Sales to Collect</h3>
            <p className="metric-value">RWF {pendingKitchenCash.toLocaleString()}</p>
            <span className="metric-label">Total sales since last collection</span>
          </div>
          <div className="metric-card warning">
            <h3>Purchases to Deduct</h3>
            <p className="metric-value">RWF {(kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
            <span className="metric-label">Purchases since last collection</span>
          </div>
          <div className={`metric-card ${(pendingKitchenCash - kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)) >= 0 ? 'primary' : 'danger'}`}>
            <h3>Profit for Dad</h3>
            <p className="metric-value">RWF {(pendingKitchenCash - kitchenTransactions
              .filter(t => {
                const tTime = new Date(t.created_at).getTime()
                const collTime = lastKitchenCollectionTime.getTime()
                return t.type === 'purchase' && tTime > collTime
              })
              .reduce((sum, t) => sum + t.amount, 0)).toLocaleString()}</p>
            <span className="metric-label">Net amount to be given to Dad</span>
          </div>
        </div>

        {/* Secondary Daily Summary */}
        <div className="daily-summary-bar" style={{marginBottom: '2rem', display: 'flex', gap: '2rem', padding: '1rem', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', justifyContent: 'center'}}>
           <span style={{fontSize: '0.9rem', color: '#64748b'}}>Work Done Today:</span>
           <span style={{fontSize: '0.9rem', fontWeight: '700', color: '#059669'}}>Today's Sales: RWF {todaysSales.toLocaleString()}</span>
           <span style={{fontSize: '0.9rem', fontWeight: '700', color: '#475569'}}>Today's Purchases: RWF {todaysPurchases.toLocaleString()}</span>
        </div>

        <div className="entry-card">
          <div className="entry-header">
            <h2>Record a Kitchen Entry</h2>
            <p className="subtitle">Choose "Sale" for food/drinks sold, or "Purchase" for things you bought.</p>
          </div>

          <form onSubmit={handleSubmit} className="entry-form">
            <div className="type-toggle-professional">
              <button 
                type="button" 
                className={`toggle-btn-pro ${type === 'order' ? 'active-sale-pro' : ''}`}
                onClick={() => setType('order')}
              >
                RECORD SALE
              </button>
              <button 
                type="button" 
                className={`toggle-btn-pro ${type === 'purchase' ? 'active-purchase-pro' : ''}`}
                onClick={() => setType('purchase')}
              >
                RECORD PURCHASE
              </button>
            </div>

            <div className="form-group">
              <label>What was sold or bought?</label>
              <textarea 
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={type === 'order' ? "Example: 2 Fish and 5 Beers" : "Example: Meat and Salt"}
                required
                className="large-input"
              />
            </div>

            <div className="form-group">
              <label>Total Price (RWF)</label>
              <input 
                type="number" 
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="How much?"
                required
                className="large-input"
              />
            </div>

            {type === 'order' && (
              <div className="form-group">
                <label>Which worker served this?</label>
                <input 
                  type="text" 
                  value={servedBy}
                  onChange={(e) => setServedBy(e.target.value)}
                  placeholder="Name of the person who took the order"
                  required
                  className="large-input"
                />
              </div>
            )}

            {message.text && (
              <div className={`portal-msg-large ${message.type}`}>
                {message.text}
              </div>
            )}

            <button type="submit" className="btn-submit-pro" disabled={loading}>
              {loading ? 'Processing...' : 'SAVE TO SYSTEM'}
            </button>
          </form>
        </div>

        <div className="recent-entries-split">
          <div className="entries-column">
            <div className="entries-header">
              <h2>Recent Sales</h2>
              <p>Money coming into the kitchen.</p>
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
                        {entry.served_by && <span className="entry-served-by">Served by: <strong>{entry.served_by}</strong></span>}
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
              <h2>Recent Purchases</h2>
              <p>Money spent on supplies.</p>
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
                <p className="empty-state">No purchases recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
