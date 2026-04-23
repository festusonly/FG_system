import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Hard timeout — if Supabase hangs, force-unblock the UI after 4s
    const hardTimeout = setTimeout(() => {
      console.warn('Auth init timed out — forcing loading=false')
      setLoading(false)
    }, 4000)

    // 1. Check initial session
    const initAuth = async () => {
      console.log('initAuth: starting...')
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        console.log('initAuth: session =', session, 'error =', error)
        if (error) throw error
        if (session?.user) {
          setUser(session.user)
          await fetchUserRole(session.user.id)
        }
      } catch (err) {
        console.error('Auth init error:', err.message)
      } finally {
        clearTimeout(hardTimeout)
        setLoading(false)
        console.log('initAuth: done, loading=false')
      }
    }

    initAuth()

    // 2. Listen for auth state changes (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // DO NOT await anything here — it blocks signInWithPassword from resolving
        if (session?.user) {
          setUser(session.user)
          // Fire-and-forget: fetch role in background, does not block login
          fetchUserRole(session.user.id)
        } else {
          setUser(null)
          setRole(null)
          setLoading(false)
        }
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  const fetchUserRole = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single()

      if (error) throw error
      setRole(data?.role || 'worker')
    } catch (err) {
      console.error('Error fetching user role:', err.message)
      setRole('worker') // Default fallback
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      setError(null)
      console.log('login: calling signInWithPassword...')

      const loginPromise = supabase.auth.signInWithPassword({ email, password })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Login timed out. Please check your internet connection.')), 10000)
      )

      const { data, error } = await Promise.race([loginPromise, timeoutPromise])

      console.log('login: result =', data, 'error =', error)
      if (error) throw error

      // Immediately fetch role so navigation can go directly to the right page
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single()

      const userRole = userData?.role || 'worker'
      setRole(userRole)
      console.log('login: success! role =', userRole)
      return { success: true, role: userRole }
    } catch (err) {
      console.error('login: failed -', err.message)
      setError(err.message)
      return { success: false, error: err.message }
    }
  }

  const logout = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setUser(null)
      setRole(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, error, login, logout, updatePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
