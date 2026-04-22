import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from './AuthContext'

const AppContext = createContext()

export function useApp() {
  return useContext(AppContext)
}

export function AppProvider({ children }) {
  const { user } = useAuth()

  const [rooms, setRooms] = useState([])
  const [transactions, setTransactions] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState(null)
  const [lastCollectionTime, setLastCollectionTime] = useState(() => {
    const stored = localStorage.getItem('lastCashCollectionTime')
    return stored ? new Date(stored) : new Date(0)
  })

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
      await Promise.all([fetchRooms(), fetchTransactions(), fetchExpenses()])
      setLoadingData(false)
    }

    loadAll()
  }, [user, fetchRooms, fetchTransactions, fetchExpenses])

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

    return () => {
      supabase.removeChannel(roomsChannel)
      supabase.removeChannel(txChannel)
      supabase.removeChannel(expChannel)
    }
  }, [user, fetchRooms, fetchTransactions, fetchExpenses])

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

  const collectCash = () => {
    // Store the current collection timestamp in localStorage.
    // This is instant, requires no database change, and persists across page refreshes.
    const now = new Date().toISOString()
    localStorage.setItem('lastCashCollectionTime', now)
    // Force re-render by updating a dummy state
    setLastCollectionTime(new Date(now))
    return { success: true }
  }

  const value = {
    rooms,
    transactions,
    expenses,
    loadingData,
    dataError,
    lastCollectionTime,
    bookRoom,
    checkoutRoom,
    reportExpense,
    collectCash,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
