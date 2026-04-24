import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from './AuthContext'
import { translations } from '../utils/translations'

const AppContext = createContext()

export function useApp() {
  return useContext(AppContext)
}

export function AppProvider({ children }) {
  const { user } = useAuth()

  const [rooms, setRooms] = useState(JSON.parse(localStorage.getItem('cache_rooms') || '[]'))
  const [transactions, setTransactions] = useState(JSON.parse(localStorage.getItem('cache_transactions') || '[]'))
  const [expenses, setExpenses] = useState(JSON.parse(localStorage.getItem('cache_expenses') || '[]'))
  const [kitchenTransactions, setKitchenTransactions] = useState(JSON.parse(localStorage.getItem('cache_kitchenTransactions') || '[]'))
  const [loadingData, setLoadingData] = useState(true)
  const [language, setLanguage] = useState(localStorage.getItem('appLanguage') || 'en')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  // Cache updates
  useEffect(() => {
    if (rooms.length > 0) localStorage.setItem('cache_rooms', JSON.stringify(rooms))
  }, [rooms])
  useEffect(() => {
    if (transactions.length > 0) localStorage.setItem('cache_transactions', JSON.stringify(transactions))
  }, [transactions])
  useEffect(() => {
    if (expenses.length > 0) localStorage.setItem('cache_expenses', JSON.stringify(expenses))
  }, [expenses])
  useEffect(() => {
    if (kitchenTransactions.length > 0) localStorage.setItem('cache_kitchenTransactions', JSON.stringify(kitchenTransactions))
  }, [kitchenTransactions])

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Translation helper
  const t = (key) => translations[language][key] || key

  const changeLanguage = (lang) => {
    setLanguage(lang)
    localStorage.setItem('appLanguage', lang)
  }
  const [dataError, setDataError] = useState(null)

  // -----------------------------------------------------------------
  // FETCH INITIAL DATA
  // -----------------------------------------------------------------
  const fetchRooms = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('room_number', { ascending: true })

    if (error) {
      console.error('Error fetching rooms:', error.message)
      return
    }
    // Normalize data shape to match what the UI expects
    setRooms(
      data.map(r => ({
        id: r.id,
        name: r.name,
        roomNumber: r.room_number,
        status: r.status,
        usageCount: r.usage_count,
        occupantDetails: null, // Populated separately via active transaction
      }))
    )
  }, [])

  const fetchTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*, rooms(name, room_number)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching transactions:', error.message)
      return
    }
    setTransactions(
      data.map(tx => ({
        id: tx.id,
        room: tx.rooms?.name || tx.room_id,
        roomId: tx.room_id,
        amount: parseFloat(tx.amount_rwf),
        type: tx.stay_type,
        days: tx.days,
        status: tx.status,
        time: tx.created_at,
        checkoutTime: tx.check_out_time,
      }))
    )
  }, [])

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching expenses:', error.message)
      return
    }
    setExpenses(
      data.map(exp => ({
        id: exp.id,
        amount: parseFloat(exp.amount_rwf),
        description: exp.description,
        time: exp.created_at,
      }))
    )
  }, [])

  const fetchKitchenTransactions = useCallback(async () => {
    const { data, error } = await supabase
      .from('kitchen_transactions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching kitchen transactions:', error.message)
      return
    }
    setKitchenTransactions(data)
  }, [])

  // Load all data from Supabase when the user is authenticated
  useEffect(() => {
    if (!user) {
      setRooms([])
      setTransactions([])
      setExpenses([])
      setLoadingData(false)
      return
    }

    const loadAll = async () => {
      setLoadingData(true)
      await Promise.all([fetchRooms(), fetchTransactions(), fetchExpenses(), fetchKitchenTransactions()])
      setLoadingData(false)
    }

    loadAll()
  }, [user, fetchRooms, fetchTransactions, fetchExpenses, fetchKitchenTransactions])

  // -----------------------------------------------------------------
  // REAL-TIME SUBSCRIPTIONS (WebSocket)
  // Any change in Supabase will instantly update every device.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!user) return

    // Subscribe to rooms changes
    const roomsChannel = supabase
      .channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        fetchRooms()
      })
      .subscribe()

    // Subscribe to new transactions
    const txChannel = supabase
      .channel('transactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchTransactions()
      })
      .subscribe()

    // Subscribe to new expenses
    const expChannel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => {
        fetchExpenses()
      })
      .subscribe()

    // Subscribe to kitchen transactions
    const kitchenChannel = supabase
      .channel('kitchen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_transactions' }, () => {
        fetchKitchenTransactions()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(roomsChannel)
      supabase.removeChannel(txChannel)
      supabase.removeChannel(expChannel)
      supabase.removeChannel(kitchenChannel)
    }
  }, [user, fetchRooms, fetchTransactions, fetchExpenses, fetchKitchenTransactions])

  // -----------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------

  const bookRoom = async (roomId, bookingDetails) => {
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      // 1. Insert the transaction into Supabase
      const { error: txError } = await supabase
        .from('transactions')
        .insert({
          room_id: roomId,
          worker_id: user.id,
          served_by: user.email, // Add this for notifications
          amount_rwf: parseFloat(bookingDetails.amount),
          stay_type: bookingDetails.stayType,
          days: bookingDetails.days ? parseInt(bookingDetails.days) : null,
          check_in_time: new Date().toISOString(),
          status: 'active',
        })

      if (txError) throw txError

      // 2. Update room status and increment usage count
      const currentRoom = rooms.find(r => r.id === roomId)
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'occupied',
          usage_count: (currentRoom?.usageCount || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId)

      if (roomError) throw roomError

      // Real-time subscriptions will update the local state automatically
      return { success: true }
    } catch (err) {
      console.error('Error booking room:', err.message)
      setDataError(err.message)
      return { success: false, error: err.message }
    }
  }

  const checkoutRoom = async (roomId) => {
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      // 1. Mark the active transaction as completed
      const { error: txError } = await supabase
        .from('transactions')
        .update({
          status: 'completed',
          check_out_time: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('room_id', roomId)
        .eq('status', 'active')

      if (txError) throw txError

      // 2. Set room back to available
      const { error: roomError } = await supabase
        .from('rooms')
        .update({
          status: 'available',
          updated_at: new Date().toISOString(),
        })
        .eq('id', roomId)

      if (roomError) throw roomError

      return { success: true }
    } catch (err) {
      console.error('Error checking out room:', err.message)
      setDataError(err.message)
      return { success: false, error: err.message }
    }
  }

  const reportExpense = async (amount, description) => {
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          worker_id: user.id,
          recorded_by: user.email, // Use recorded_by for expenses
          amount_rwf: parseFloat(amount),
          description: description.trim(),
        })

      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Error reporting expense:', err.message)
      setDataError(err.message)
      return { success: false, error: err.message }
    }
  }

  const lastCollectionTime = useMemo(() => {
    // Filter for system marker events
    const collections = expenses.filter(e => 
      e.description === 'SYSTEM_CASH_COLLECTION' || 
      e.description?.includes('SYSTEM_CASH_COLLECTION')
    )
    
    if (collections.length === 0) return new Date(0)
    
    // Find the absolute latest collection timestamp
    const timestamps = collections.map(e => new Date(e.time).getTime())
    return new Date(Math.max(...timestamps))
  }, [expenses])

  const lastKitchenCollectionTime = useMemo(() => {
    const collections = expenses.filter(e => 
      e.description === 'KITCHEN_CASH_COLLECTION'
    )
    if (collections.length === 0) return new Date(0)
    const timestamps = collections.map(e => new Date(e.time).getTime())
    return new Date(Math.max(...timestamps))
  }, [expenses])

  const collectCash = async () => {
    if (!user) return { success: false, error: 'Not authenticated' }
    
    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          worker_id: user.id,
          amount_rwf: 1, // Using 1 RWF instead of 0.01 in case the DB column is Integer type
          description: 'SYSTEM_CASH_COLLECTION',
        })
      
      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Error collecting cash:', err.message)
      setDataError(err.message)
      return { success: false, error: err.message }
    }
  }

  const collectKitchenCash = async () => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('expenses')
        .insert({
          worker_id: user.id,
          amount_rwf: 1,
          description: 'KITCHEN_CASH_COLLECTION',
        })
      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Error collecting kitchen cash:', err.message)
      return { success: false, error: err.message }
    }
  }

  const value = {
    rooms,
    transactions,
    expenses,
    kitchenTransactions,
    loadingData,
    dataError,
    lastCollectionTime,
    lastKitchenCollectionTime,
    bookRoom,
    checkoutRoom,
    reportExpense,
    collectCash,
    collectKitchenCash,
    t,
    language,
    changeLanguage,
    isOffline
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
