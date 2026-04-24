import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../context/AppContext'
import '../styles/Login.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, user, role, loading: authLoading } = useAuth()
  const { t, language, changeLanguage, deferredPrompt, installPWA, isPWAInstalled } = useApp()
  const navigate = useNavigate()

  // Persistent Login Check: If already logged in, go to dashboard
  React.useEffect(() => {
    if (!authLoading && user) {
      if (role === 'admin') navigate('/admin', { replace: true })
      else if (role === 'kitchen') navigate('/kitchen', { replace: true })
      else navigate('/staff', { replace: true })
    }
  }, [user, role, authLoading, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await login(email, password)
    if (result.success) {
      // Navigate directly to the right dashboard
      if (result.role === 'admin') navigate('/admin')
      else if (result.role === 'kitchen') navigate('/kitchen')
      else navigate('/staff')
    } else {
      setError(result.error || 'Login failed')
    }

    setLoading(false)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="language-switch" style={{display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '30px', border: '1px solid #e2e8f0', width: 'fit-content', margin: '0 auto 1.5rem auto'}}>
             <button 
               type="button"
               onClick={() => changeLanguage('en')}
               style={{
                 background: language === 'en' ? '#0d9488' : 'transparent', 
                 color: language === 'en' ? 'white' : '#64748b', 
                 border: 'none', 
                 padding: '5px 15px', 
                 borderRadius: '25px', 
                 cursor: 'pointer', 
                 fontWeight: 'bold',
                 fontSize: '0.85rem',
                 transition: 'all 0.3s ease'
               }}
             >EN</button>
             <button 
               type="button"
               onClick={() => changeLanguage('rw')}
               style={{
                 background: language === 'rw' ? '#0d9488' : 'transparent', 
                 color: language === 'rw' ? 'white' : '#64748b', 
                 border: 'none', 
                 padding: '5px 15px', 
                 borderRadius: '25px', 
                 cursor: 'pointer', 
                 fontWeight: 'bold',
                 fontSize: '0.85rem',
                 transition: 'all 0.3s ease'
               }}
             >RW</button>
          </div>
          <h1>{t('welcome_back')}</h1>
          <p>{t('login_subtitle')}</p>
        </div>

        <div className="pwa-install-section" style={{
          marginBottom: '2rem',
          padding: '15px',
          background: '#f0fdfa',
          borderRadius: '12px',
          border: '1px solid #5eead4',
          textAlign: 'center'
        }}>
          {deferredPrompt ? (
            <button 
              type="button"
              onClick={installPWA}
              style={{
                width: '100%',
                background: '#0d9488',
                color: 'white',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}
            >
              📲 Install Flower App
            </button>
          ) : (
            <div style={{color: '#0f766e', fontSize: '0.9rem', fontWeight: '500'}}>
              💡 To Install: Tap the 3 dots (top right) and select "Add to Home Screen"
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">{t('email_label')}</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="worker@flowerguesthouse.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">{t('password_label')}</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
              <button 
                type="button" 
                className="btn-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-login"
            disabled={loading}
          >
            {loading ? t('loading') : t('login_btn')}
          </button>
        </form>

        <div className="login-footer">
          <p className="info-text">
            <strong>Workers:</strong> Use your worker credentials
          </p>
          <p className="info-text">
            <strong>Admin:</strong> Use admin credentials
          </p>
        </div>
      </div>
    </div>
  )
}
