# Two-Portal Architecture: Staff & Admin

## 🎯 The Big Picture

**One Backend (Supabase) + Two Different UIs = Perfect Separation of Concerns**

```
┌─────────────────────────────────────────────────┐
│           Supabase Backend (PostgreSQL)         │
│  ┌──────────────┐  ┌──────────────────────┐    │
│  │ Transactions │  │ Users (role-based)   │    │
│  │ Rooms        │  │ Weekly Reports       │    │
│  │ Daily Stats  │  │ Row-Level Security   │    │
│  └──────────────┘  └──────────────────────┘    │
└──────────────┬────────────────────────┬─────────┘
               │                        │
           WebSocket                WebSocket
      (Real-time updates)      (Real-time updates)
               │                        │
       ┌───────▼────────┐       ┌──────▼─────────┐
       │  /staff Portal │       │  /admin Portal │
       │  (Worker UI)   │       │  (Owner UI)    │
       ├───────────────┤       ├────────────────┤
       │ Big Buttons   │       │ Analytics      │
       │ Room Select   │       │ Live Metrics   │
       │ Payment Form  │       │ Reports        │
       │ Transaction   │       │ History Logs   │
       │ Log           │       │ Occupancy Map  │
       └───────────────┘       └────────────────┘
```

---

## 🔐 Authentication & Role System

### Login Flow

```
1. User goes to /login
                ↓
2. User enters email + password
                ↓
3. Send to Supabase Auth
                ↓
4. Supabase returns JWT token (encrypted session)
                ↓
5. Query users table to get role
                ↓
6. If role === 'admin' → Redirect to /admin
   If role === 'worker' → Redirect to /staff
```

### Code Example

```jsx
// In Login.jsx
const handleSubmit = async (e) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  
  // Fetch role from users table
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single()
  
  // Redirect based on role
  if (userData.role === 'admin') navigate('/admin')
  if (userData.role === 'worker') navigate('/staff')
}
```

---

## 🛣️ Routing Architecture

### Route Map

```
/login
  └─ Public
     Everyone can access
     Login form
     
/staff
  └─ Protected (requires role: 'worker')
     Big button interface
     Room selection
     Payment logging
     Personal transaction history
     
/admin
  └─ Protected (requires role: 'admin')
     Live analytics dashboard
     All transactions
     Reports & exports
     Staff management
     Settings
     
/dashboard
  └─ Protected (requires authentication)
     Smart redirect based on role
     If admin → /admin
     If worker → /staff
     
/ (root)
  └─ If logged in → /dashboard
     If not logged in → /login
```

### Protected Route Component

```jsx
// In App.jsx
function ProtectedRoute({ children, requiredRole = null }) {
  const { user, role, loading } = useAuth()

  if (loading) return <LoadingScreen />
  
  if (!user) return <Navigate to="/login" replace />
  
  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// Usage
<Route
  path="/admin"
  element={
    <ProtectedRoute requiredRole="admin">
      <AdminDashboard />
    </ProtectedRoute>
  }
/>
```

---

## 📊 Data Isolation via Row-Level Security (RLS)

### The Problem
Both portals access the same database. How do we prevent workers from seeing other workers' data?

### The Solution: Supabase RLS Policies

**Worker's View** (Only sees own transactions):
```sql
CREATE POLICY "Workers see own transactions" 
  ON transactions
  FOR SELECT
  USING (worker_id = auth.uid());
```

**Admin's View** (Sees all transactions):
```sql
CREATE POLICY "Admins see all transactions" 
  ON transactions
  FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
```

### How It Works

**When a worker queries:**
```javascript
// Worker logged in as user_id = 'abc123'
const { data } = await supabase
  .from('transactions')
  .select('*')

// Supabase applies RLS:
// SELECT * FROM transactions 
// WHERE worker_id = 'abc123'  ← Only their own
```

**When admin queries:**
```javascript
// Admin queries same table
const { data } = await supabase
  .from('transactions')
  .select('*')

// Supabase applies RLS:
// SELECT * FROM transactions  ← All records
```

### Benefits
- Security at database level (not just app code)
- Impossible to bypass by hacking frontend
- Workers can't see each other's data even if they try
- Admin can see everything
- Same table, multiple "views"

---

## 🔄 Real-Time Sync

### WebSocket Subscriptions

Both portals receive live updates from the same backend:

**Worker Portal** (gets notified of room status changes):
```jsx
// In StaffPortal.jsx
useEffect(() => {
  supabase
    .from('rooms')
    .on('UPDATE', ({ new: room }) => {
      setRoomStatus(room.status)
    })
    .subscribe()
}, [])
```

**Admin Dashboard** (gets live transaction updates):
```jsx
// In AdminDashboard.jsx
useEffect(() => {
  supabase
    .from('transactions')
    .on('INSERT', ({ new: transaction }) => {
      // Update live metrics
      setStats(prev => ({
        ...prev,
        totalToday: prev.totalToday + transaction.amount_rwf
      }))
    })
    .subscribe()
}, [])
```

### Flow Diagram

```
Worker logs payment on /staff
  ↓
Creates transaction in Supabase
  ↓
Database triggers INSERT event
  ↓
WebSocket broadcasts to all connected clients
  ↓
┌─────────────────────────────────────┐
│ /admin receives update instantly    │
│ Metrics update in real-time         │
│ No page refresh needed              │
└─────────────────────────────────────┘
```

---

## 🎨 UI Differences

### Staff Portal (/staff)

**Design Philosophy**: Simplicity for workers with minimal tech skills

```
┌─────────────────────────────────┐
│  🌸 Worker Portal               │
│  Welcome, john@example.com  [X] │
├─────────────────────────────────┤
│  Select Room                    │
│  ┌──────────┬──────────┬────────┐
│  │ Room 1   │ Room 2   │ Room 3 │
│  ├──────────┼──────────┼────────┤
│  │ Room 4   │ Room 5   │ Room 6 │
│  ├──────────┼──────────┼────────┤
│  │ Room 7   │ Room 8   │ Room 9 │
│  └──────────┴──────────┴────────┘
├─────────────────────────────────┤
│ [Fixed Button Example]          │
│ When room selected:             │
│ ┌──────────────────────────────┐│
│ │ Payment for Room 1           ││
│ │                              ││
│ │ Stay Type:                   ││
│ │ [⏰ Short Stay] [🌙 Full]   ││
│ │                              ││
│ │ Amount: [_____________]      ││
│ │                              ││
│ │ [💾 Save] [Cancel]           ││
│ └──────────────────────────────┘│
└─────────────────────────────────┘
```

**Features**:
- Big, tap-friendly buttons
- No typing (just taps and selections)
- Minimal data display
- Instant feedback
- Clear success/error messages

---

### Admin Dashboard (/admin)

**Design Philosophy**: Comprehensive analytics and control

```
┌──────────────────────────────────────┐
│  📊 Admin Dashboard                  │
│  Owner: admin@example.com        [X] │
├──────────────────────────────────────┤
│  ┌──────────────┐ ┌──────────────┐  │
│  │ Today's      │ │ Active       │  │
│  │ Revenue      │ │ Guests       │  │
│  │ RWF 450,000  │ │ 8            │  │
│  └──────────────┘ └──────────────┘  │
│                                      │
│  📋 Today's Transactions             │
│  ┌────────────────────────────────┐  │
│  │ Room | Amount | Type | Time   │  │
│  ├────────────────────────────────┤  │
│  │ Room 1 | RWF 50k | ⏰ | 14:30 │  │
│  │ Room 3 | RWF 80k | 🌙 | 15:45 │  │
│  └────────────────────────────────┘  │
│                                      │
│  ⚙️ Quick Actions                    │
│  [📊 Report] [📅 History] [🔧 Conf] │
└──────────────────────────────────────┘
```

**Features**:
- Real-time metrics
- Transaction history with filters
- Data visualizations
- Reports & exports
- Staff management
- Settings & configuration

---

## 🔗 Shared Context & State

### AuthContext (Global State)

Used by both portals:

```jsx
// src/context/AuthContext.jsx
export function useAuth() {
  return {
    user: { id, email, ... },
    role: 'admin' | 'worker',
    loading: boolean,
    error: string | null,
    login: (email, password) => Promise,
    logout: () => Promise
  }
}
```

**Usage in both portals**:

```jsx
// StaffPortal.jsx
const { user, role, logout } = useAuth()

// AdminDashboard.jsx
const { user, role, logout } = useAuth()
```

---

## 🌐 API Flow Diagram

### Same Backend, Different Data Views

```
Frontend Request:
  User: worker_123
  Role: worker
  Query: GET /transactions
      ↓
Supabase receives request
  Attaches auth context
      ↓
Apply RLS Policy:
  WHERE worker_id = worker_123
      ↓
Return: Only this worker's transactions
      ↓
Frontend update (Worker sees only their data)


---


Frontend Request:
  User: admin_456
  Role: admin
  Query: GET /transactions
      ↓
Supabase receives request
  Attaches auth context
      ↓
Apply RLS Policy:
  (No restriction for admin)
      ↓
Return: All transactions
      ↓
Frontend update (Admin sees everything)
```

---

## 🚀 Communication Between Portals

### Example: Worker logs payment → Admin sees it instantly

```
1. Worker clicks Room 4, enters RWF 5000
   ↓
2. StaffPortal.jsx submits:
   POST /transactions {
     room_id: "room-4",
     amount_rwf: 5000,
     stay_type: "short_stay"
   }
   ↓
3. Supabase inserts into transactions table
   ↓
4. WebSocket broadcasts INSERT event
   ↓
5. AdminDashboard.jsx listener triggers:
   "New transaction from Room 4!"
   ↓
6. Admin's dashboard updates in real-time:
   - totalToday increases by 5000
   - New row appears in transaction table
   ↓
7. No admin page refresh needed!
```

---

## 📁 File Organization (Two-Portal Pattern)

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx              ← Shared by both
│   │   ├── StaffPortal.jsx        ← /staff route
│   │   └── AdminDashboard.jsx     ← /admin route
│   │
│   ├── context/
│   │   └── AuthContext.jsx        ← Shared auth state
│   │
│   ├── services/
│   │   └── supabaseClient.js      ← Shared API client
│   │
│   ├── App.jsx                    ← Routing config
│   ├── main.jsx                   ← Entry point
│   └── styles/                    ← Portal-specific CSS
│       ├── Login.css
│       ├── StaffPortal.css
│       └── AdminDashboard.css
```

**Key Insight**: Minimal code duplication. Login screen is shared. Each portal has its own page component and styles.

---

## 🔑 Key Principles

1. **Single Source of Truth**: One Supabase backend
2. **Role-Based Security**: RLS policies enforce data access
3. **Real-time Sync**: WebSocket keeps both UIs in sync
4. **Shared Auth**: Both use same login, different redirects
5. **Separate UX**: Each portal optimized for its user
6. **Stateless Backend**: No server logic, just database

---

## ✅ Checklist: Before Going Live

- [ ] RLS policies set up in Supabase
- [ ] Users table has role column (admin/worker)
- [ ] Auth credentials in .env file
- [ ] Both portals tested with test accounts
- [ ] WebSocket subscriptions working
- [ ] Logout works from both portals
- [ ] Protected routes redirect properly
- [ ] Mobile responsive design tested
- [ ] Error handling for network failures
- [ ] Password requirements set

---

## 🐛 Troubleshooting

### "Worker can see other workers' data"
→ Check RLS policy is enabled on transactions table

### "Admin redirects to /staff"
→ Check user's role in users table (must be 'admin')

### "Updates don't sync between portals"
→ Check WebSocket subscription is active
→ Check browser console for connection errors

### "Login works but still redirected to /login"
→ Check useAuth hook is inside AuthProvider
→ Check session persists after page refresh

---

**This architecture is production-ready and scales beautifully!** 🚀
