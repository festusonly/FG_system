import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../services/supabaseClient'
import { useAuth } from './AuthContext'
import { translations } from '../utils/translations'

const showLocalNotification = (title, body, tag) => {
  console.log('🔔 AppContext: Attempting notification:', title, body);
  
  try {
    // Rely primarily on browser permissions, not just a local flag.
    if (!window.Notification || Notification.permission !== 'granted') return;

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title: title,
        body: body,
        tag: tag || 'general'
      });
    } else if ('serviceWorker' in navigator) {
      // Fallback if controller isn't active yet
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
    } else {
      new window.Notification(title, { body, icon: '/icon-512.png', requireInteraction: true });
    }
  } catch (e) {
    console.error('🔔 Notification error:', e);
  }
}

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
  const [employees, setEmployees] = useState(JSON.parse(localStorage.getItem('cache_employees') || '[]'))
  const [deductions, setDeductions] = useState(JSON.parse(localStorage.getItem('cache_deductions') || '[]'))
  const [loadingData, setLoadingData] = useState(true)
  const [language, setLanguage] = useState(localStorage.getItem('appLanguage') || 'en')
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isPWAInstalled, setIsPWAInstalled] = useState(false)

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
  useEffect(() => {
    if (employees.length > 0) localStorage.setItem('cache_employees', JSON.stringify(employees))
  }, [employees])
  useEffect(() => {
    if (deductions.length > 0) localStorage.setItem('cache_deductions', JSON.stringify(deductions))
  }, [deductions])

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // PWA Install Logic
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsPWAInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Check if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsPWAInstalled(true)
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const installPWA = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }

  // Translation helper
  const t = (key, vars = {}) => {
    let str = translations[language][key] || translations['en'][key] || key
    if (typeof str === 'string') {
      Object.keys(vars).forEach(k => {
        str = str.replace(`{${k}}`, vars[k])
      })
    }
    return str
  }

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

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching employees:', error.message)
      return
    }
    setEmployees(data)
  }, [])

  const fetchDeductions = useCallback(async () => {
    const { data, error } = await supabase
      .from('employee_deductions')
      .select('*, recorded_by:users(name, email)')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching deductions:', error.message)
      return
    }
    setDeductions(data)
  }, [])

  // Load all data from Supabase when the user is authenticated
  useEffect(() => {
    if (!user) {
      setRooms([])
      setTransactions([])
      setExpenses([])
      setEmployees([])
      setDeductions([])
      setLoadingData(false)
      return
    }

    const loadAll = async () => {
      setLoadingData(true)
      await Promise.all([fetchRooms(), fetchTransactions(), fetchExpenses(), fetchKitchenTransactions(), fetchEmployees(), fetchDeductions()])
      setLoadingData(false)
    }

    loadAll()
  }, [user, fetchRooms, fetchTransactions, fetchExpenses, fetchKitchenTransactions, fetchEmployees, fetchDeductions])

  const refreshData = async () => {
    setLoadingData(true)
    await Promise.all([fetchRooms(), fetchTransactions(), fetchExpenses(), fetchKitchenTransactions(), fetchEmployees(), fetchDeductions()])
    setLoadingData(false)
  }

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, (payload) => {
        fetchTransactions()
        
        // Notify if it's a NEW booking or a completion
        if (payload.eventType === 'INSERT' && payload.new.worker_id !== user.id) {
          const amount = payload.new.amount_rwf || 0;
          const typeName = payload.new.stay_type === 'short_hours' ? t('short_stay') : t('night_stay');
          showLocalNotification(
            t('alert_new_booking_title'), 
            t('alert_new_booking_desc', { type: typeName, amount: amount.toLocaleString() }), 
            'room-booking'
          )
        } else if (payload.eventType === 'UPDATE' && payload.new.status === 'completed' && payload.new.worker_id !== user.id) {
          showLocalNotification(
            t('alert_checkout_title'), 
            t('alert_checkout_desc'), 
            'room-checkout'
          )
        }
      })
      .subscribe()

    // Subscribe to new expenses
    const expChannel = supabase
      .channel('expenses-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
        fetchExpenses()
        
        if (payload.eventType === 'INSERT' && payload.new.worker_id !== user.id) {
          const desc = payload.new.description;
          if (desc === 'SYSTEM_CASH_COLLECTION' || desc === 'KITCHEN_CASH_COLLECTION') return;
          
          const amount = payload.new.amount_rwf || 0;
          showLocalNotification(
            t('alert_expense_title'), 
            t('alert_expense_desc', { amount: amount.toLocaleString(), desc }), 
            'expense-report'
          )
        }
      })
      .subscribe()

    // Subscribe to kitchen transactions
    const kitchenChannel = supabase
      .channel('kitchen-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_transactions' }, (payload) => {
        fetchKitchenTransactions()
        
        if (payload.eventType === 'INSERT') {
          // Check if triggered by someone else (we use served_by email check here)
          if (payload.new.served_by !== user.email) {
            const tx = payload.new
            const amount = tx.amount || 0;
            const workerName = tx.served_by ? tx.served_by.split('@')[0] : t('kitchen_worker');
            
            if (tx.type === 'order') {
              showLocalNotification(
                t('alert_kitchen_sale_title'), 
                t('alert_kitchen_sale_desc', { worker: workerName, desc: tx.description, amount: amount.toLocaleString() }), 
                'kitchen-sale'
              )
            } else {
              showLocalNotification(
                t('alert_kitchen_purchase_title'), 
                t('alert_kitchen_purchase_desc', { worker: workerName, desc: tx.description, amount: amount.toLocaleString() }), 
                'kitchen-purchase'
              )
            }
          }
        }
      })
      .subscribe()

    // Subscribe to employees changes
    const employeesChannel = supabase
      .channel('employees-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, () => {
        fetchEmployees()
      })
      .subscribe()

    // Subscribe to deductions changes
    const deductionsChannel = supabase
      .channel('deductions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_deductions' }, () => {
        fetchDeductions()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(roomsChannel)
      supabase.removeChannel(txChannel)
      supabase.removeChannel(expChannel)
      supabase.removeChannel(kitchenChannel)
      supabase.removeChannel(employeesChannel)
      supabase.removeChannel(deductionsChannel)
    }
  }, [user, fetchRooms, fetchTransactions, fetchExpenses, fetchKitchenTransactions, fetchEmployees, fetchDeductions])

  // -----------------------------------------------------------------
  // ACTIONS
  // -----------------------------------------------------------------

  const registerEmployee = async (employeeData, idImageFile) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      let imageUrl = null;
      if (idImageFile) {
        const fileExt = idImageFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('employee_ids')
          .upload(filePath, idImageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('employee_ids')
          .getPublicUrl(filePath);
          
        imageUrl = publicUrl;
      }

      const { error } = await supabase
        .from('employees')
        .insert({
          name: employeeData.name,
          age: parseInt(employeeData.age),
          phone: employeeData.phone,
          base_salary: parseFloat(employeeData.baseSalary || 0),
          id_screenshot_url: imageUrl
        });

      if (error) throw error;
      fetchEmployees();
      return { success: true };
    } catch (err) {
      console.error('Error registering employee:', err.message);
      return { success: false, error: err.message };
    }
  }

  const removeEmployee = async (employeeId) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employeeId);

      if (error) throw error;
      fetchEmployees();
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error removing employee:', err.message);
      return { success: false, error: err.message };
    }
  }

  const recordDeduction = async (employeeId, type, amount, reason) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employee_deductions')
        .insert({
          employee_id: employeeId,
          recorded_by: user.id,
          type: type, // 'loan' or 'fine'
          amount_rwf: parseFloat(amount),
          reason: reason
        });

      if (error) throw error;
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error recording deduction:', err.message);
      return { success: false, error: err.message };
    }
  }

  const resolveDeduction = async (deductionId) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employee_deductions')
        .update({ status: 'resolved' })
        .eq('id', deductionId);

      if (error) throw error;
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error resolving deduction:', err.message);
      return { success: false, error: err.message };
    }
  }

  const deleteDeduction = async (deductionId) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employee_deductions')
        .delete()
        .eq('id', deductionId);

      if (error) throw error;
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error deleting deduction:', err.message);
      return { success: false, error: err.message };
    }
  }

  const updateEmployeeSalary = async (employeeId, newSalary) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employees')
        .update({ base_salary: parseFloat(newSalary) })
        .eq('id', employeeId);

      if (error) throw error;
      fetchEmployees();
      return { success: true };
    } catch (err) {
      console.error('Error updating salary:', err.message);
      return { success: false, error: err.message };
    }
  }

  const payEmployeeSalary = async (employeeId) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employee_deductions')
        .update({ status: 'resolved' })
        .eq('employee_id', employeeId)
        .eq('status', 'pending');

      if (error) throw error;
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error paying employee:', err.message);
      return { success: false, error: err.message };
    }
  }

  const payAllSalaries = async () => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('employee_deductions')
        .update({ status: 'resolved' })
        .eq('status', 'pending');

      if (error) throw error;
      fetchDeductions();
      return { success: true };
    } catch (err) {
      console.error('Error paying all salaries:', err.message);
      return { success: false, error: err.message };
    }
  }

  const bookRoom = async (roomId, bookingDetails) => {
    if (!user) return { success: false, error: 'Not authenticated' }

    try {
      // Single atomic RPC call — inserts transaction + updates room status in one DB transaction.
      // The SQL function uses FOR UPDATE row locking, so duplicate bookings are impossible.
      const { data, error } = await supabase.rpc('book_room', {
        p_room_id: roomId,
        p_worker_id: user.id,
        p_amount_rwf: parseFloat(bookingDetails.amount),
        p_stay_type: bookingDetails.stayType,
        p_days: bookingDetails.days ? parseInt(bookingDetails.days) : null,
      })

      if (error) throw error

      // The RPC returns { success: true } or { success: false, error: '...' }
      if (data?.success === false) {
        return { success: false, error: data.error || 'Booking failed' }
      }

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

  const undoLastCollection = async () => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase.rpc('admin_undo_collection', {
        p_type: 'SYSTEM_CASH_COLLECTION'
      })

      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Undo collection error:', err.message)
      return { success: false, error: err.message }
    }
  }

  const undoLastKitchenCollection = async () => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase.rpc('admin_undo_collection', {
        p_type: 'KITCHEN_CASH_COLLECTION'
      })

      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Undo kitchen collection error:', err.message)
      return { success: false, error: err.message }
    }
  }

  const editTransaction = async (id, updates) => {
    if (!user) return { success: false, error: 'Not authenticated' }
    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          amount_rwf: updates.amount,
          room_id: updates.roomId,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
      
      if (error) throw error
      return { success: true }
    } catch (err) {
      console.error('Error editing transaction:', err.message)
      return { success: false, error: err.message }
    }
  }

  const value = {
    rooms,
    transactions,
    expenses,
    kitchenTransactions,
    employees,
    deductions,
    loadingData,
    dataError,
    lastCollectionTime,
    lastKitchenCollectionTime,
    bookRoom,
    checkoutRoom,
    reportExpense,
    collectCash,
    collectKitchenCash,
    registerEmployee,
    removeEmployee,
    updateEmployeeSalary,
    recordDeduction,
    resolveDeduction,
    payEmployeeSalary,
    payAllSalaries,
    deleteDeduction,
    t,
    language,
    changeLanguage,
    isOffline,
    deferredPrompt,
    installPWA,
    isPWAInstalled,
    refreshData,
    undoLastCollection,
    undoLastKitchenCollection,
    editTransaction
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
