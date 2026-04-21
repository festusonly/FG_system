# Backend Architecture - Guesthouse Digital Management System

The backend is built entirely on **Supabase** (PostgreSQL + managed services). No custom server needed = zero ops, fast development, free tier compatible.

## 🏗️ Architecture Overview

```
Frontend (PWA)
     ↓
  HTTPS / WebSocket
     ↓
┌─────────────────────────────────┐
│    Supabase (PostgreSQL)        │
├─────────────────────────────────┤
│ • Real-time Database            │
│ • Authentication (JWT)          │
│ • Row-Level Security (RLS)      │
│ • Edge Functions (Serverless)   │
│ • Scheduled Jobs (Cron)         │
└─────────────────────────────────┘
     ↓
External Services
  ├─ Twilio (WhatsApp)
  ├─ PDF Generator (jsPDF/ReportLab)
  └─ Email (SendGrid or Resend)
```

## 🗄️ Database Schema (Detailed)

### 1. Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'worker')),
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Allow frontend to read email, name, phone, role (not password)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can read all users" ON users
  FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
```

**Purpose**: Authentication + role management  
**Used by**: Frontend login, permission checks  
**Note**: Password never touches frontend; Supabase handles hashing

---

### 2. Rooms Table

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number VARCHAR(10) NOT NULL UNIQUE,
  capacity INT DEFAULT 2,
  status VARCHAR(20) DEFAULT 'available' 
    CHECK (status IN ('available', 'occupied', 'maintenance')),
  last_status_change TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rooms" ON rooms FOR SELECT;
CREATE POLICY "Only admins can modify rooms" ON rooms
  FOR ALL USING (auth.jwt() ->> 'role' = 'admin');
```

**Purpose**: Store physical room information  
**Used by**: Worker portal (room selection), admin dashboard (room status)  
**Key insight**: Simple - room numbers are the business reality

---

### 3. Transactions Table (Core Data)

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  amount_rwf DECIMAL(10, 2) NOT NULL CHECK (amount_rwf > 0),
  stay_type VARCHAR(20) NOT NULL 
    CHECK (stay_type IN ('short_stay', 'full_night')),
  check_in_time TIMESTAMP NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMP,
  duration_hours DECIMAL(5, 2),
  notes TEXT,
  payment_method VARCHAR(20) DEFAULT 'cash' 
    CHECK (payment_method IN ('cash', 'mobile_money', 'card')),
  status VARCHAR(20) DEFAULT 'active' 
    CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  week_number INT,  -- For grouping in reports
  archived BOOLEAN DEFAULT false
);

-- Indexes for fast queries
CREATE INDEX idx_transactions_room_id ON transactions(room_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_week_number ON transactions(week_number);
CREATE INDEX idx_transactions_status ON transactions(status);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workers can read/create own transactions" ON transactions
  FOR SELECT USING (worker_id = auth.uid());
CREATE POLICY "Admins can read all transactions" ON transactions
  FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
CREATE POLICY "Workers can create transactions" ON transactions
  FOR INSERT WITH CHECK (worker_id = auth.uid());
```

**Purpose**: Every payment is logged here with full metadata  
**Critical for**: Revenue tracking, history, reports  
**Key fields**:
- `amount_rwf`: The payment amount
- `stay_type`: Differentiates pricing models
- `week_number`: Groups data for auto-deletion after reports
- `archived`: Soft delete flag before permanent deletion

---

### 4. Weekly Reports Table

```sql
CREATE TABLE weekly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INT NOT NULL UNIQUE,
  year INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue DECIMAL(12, 2) DEFAULT 0,
  total_transactions INT DEFAULT 0,
  short_stay_revenue DECIMAL(12, 2) DEFAULT 0,
  full_night_revenue DECIMAL(12, 2) DEFAULT 0,
  short_stay_count INT DEFAULT 0,
  full_night_count INT DEFAULT 0,
  average_room_occupancy DECIMAL(5, 2),
  pdf_url VARCHAR(500),  -- S3 or Supabase storage URL
  sent_to_owner BOOLEAN DEFAULT false,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_weekly_reports_week ON weekly_reports(week_number, year);

ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Only admins can read reports" ON weekly_reports
  FOR SELECT USING (auth.jwt() ->> 'role' = 'admin');
```

**Purpose**: Store generated report metadata  
**Used by**: Admin dashboard (view past reports), scheduling (check if sent)  
**Auto-deletion logic**: After `sent_to_owner = true` for 7+ days, trigger deletion of related transactions

---

### 5. Daily Snapshots Table (Optional but Useful)

```sql
CREATE TABLE daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,
  total_revenue DECIMAL(12, 2),
  active_rooms INT,
  completed_checkouts INT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_daily_snapshots_date ON daily_snapshots(snapshot_date);
```

**Purpose**: Cache daily stats for quick dashboard loads  
**Trigger**: Created nightly at 23:59  
**Benefit**: Faster aggregations without scanning all transactions

---

## 🔌 API Endpoints (Supabase Auto-Generated)

Supabase automatically exposes REST APIs. Frontend calls these directly:

### Authentication Endpoints

```
POST /auth/v1/signup
  Request: { email, password, phone, name }
  Response: { user, session }

POST /auth/v1/signin
  Request: { email, password }
  Response: { user, session }

POST /auth/v1/logout
  Request: { }
  Response: {}

POST /auth/v1/refresh
  Request: {}
  Response: { session }
```

---

### Read-Only Endpoints (Supabase REST Auto)

```
GET /rest/v1/rooms
  Query: ?select=id,room_number,status
  Returns: [{ id, room_number, status }, ...]

GET /rest/v1/transactions
  Query: ?select=*&status=eq.active&order=created_at.desc
  Returns: Transaction list (filtered by RLS policy)

GET /rest/v1/weekly_reports
  Query: ?select=*&sent_to_owner=eq.true&order=created_at.desc
  Returns: Report list (admin only via RLS)
```

---

### Write Endpoints (via RLS Policies)

```
POST /rest/v1/transactions
  Request: {
    room_id: "uuid",
    amount_rwf: 5000,
    stay_type: "short_stay",
    check_in_time: "2026-04-21T14:30:00Z"
  }
  Response: { id, created_at, ... }
  (Worker auto-added via auth.uid())

PATCH /rest/v1/transactions?id=eq.{transaction_id}
  Request: {
    check_out_time: "2026-04-21T18:00:00Z",
    status: "completed"
  }
  Response: Updated transaction
  (Only worker who created it can update)
```

---

## ⚡ Real-Time Subscriptions (WebSocket)

Frontend subscribes to live updates:

```javascript
// Worker portal updates when new transaction created
supabase
  .from('transactions')
  .on('INSERT', payload => {
    console.log('New payment:', payload.new);
    // Update UI in real-time
  })
  .subscribe();

// Admin dashboard updates live metrics
supabase
  .from('transactions')
  .on('INSERT', payload => {
    updateDashboardTotals(payload.new);
  })
  .subscribe();

// Room status changes
supabase
  .from('rooms')
  .on('UPDATE', payload => {
    updateRoomUI(payload.new.id, payload.new.status);
  })
  .subscribe();
```

**Why WebSocket?** 
- No polling = less bandwidth
- Real-time feel (instant dashboard updates)
- Supabase handles all infrastructure

---

## 🔧 Edge Functions (Serverless)

These run in Supabase's cloud when triggered. No server to manage.

### 1. Generate Weekly Report Function

**File**: `functions/generateWeeklyReport.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_KEY')
  )

  // Get current week's transactions
  const weekNumber = getCurrentWeekNumber()
  const transactions = await supabase
    .from('transactions')
    .select('*')
    .eq('week_number', weekNumber)

  // Calculate totals
  const totalRevenue = transactions.data.reduce((sum, t) => sum + t.amount_rwf, 0)
  const shortStayRevenue = transactions.data
    .filter(t => t.stay_type === 'short_stay')
    .reduce((sum, t) => sum + t.amount_rwf, 0)
  const fullNightRevenue = totalRevenue - shortStayRevenue

  // Generate PDF
  const pdfBuffer = await generatePDF({
    weekNumber,
    totalRevenue,
    shortStayRevenue,
    fullNightRevenue,
    transactionCount: transactions.data.length,
  })

  // Upload PDF to Supabase Storage
  const fileName = `reports/week_${weekNumber}_${Date.now()}.pdf`
  await supabase.storage
    .from('reports')
    .upload(fileName, pdfBuffer)

  // Create report record
  await supabase.from('weekly_reports').insert({
    week_number: weekNumber,
    total_revenue: totalRevenue,
    short_stay_revenue: shortStayRevenue,
    full_night_revenue: fullNightRevenue,
    total_transactions: transactions.data.length,
    pdf_url: `${supabaseUrl}/storage/v1/object/public/reports/${fileName}`,
  })

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Triggered**: Every Sunday at 23:00 UTC (via Cron)

---

### 2. Send WhatsApp Report Function

**File**: `functions/sendWhatsAppReport.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_KEY')
  )

  // Get latest unsent report
  const { data: report } = await supabase
    .from('weekly_reports')
    .select('*')
    .eq('sent_to_owner', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (!report) return new Response('No unsent reports', { status: 200 })

  // Get owner's phone number
  const { data: admin } = await supabase
    .from('users')
    .select('phone')
    .eq('role', 'admin')
    .limit(1)

  // Send via Twilio WhatsApp
  const response = await fetch('https://api.twilio.com/2010-04-01/Accounts/{ACCOUNT_SID}/Messages.json', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(TWILIO_KEY:TWILIO_SECRET)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: 'whatsapp:+1234567890',  // Your Twilio WhatsApp number
      To: `whatsapp:${admin.phone}`,
      Body: `Weekly Report - Week ${report.week_number}\n\nTotal Revenue: RWF ${report.total_revenue}\nTransactions: ${report.total_transactions}`,
      MediaUrl: report.pdf_url,
    })
  })

  // Mark report as sent
  await supabase
    .from('weekly_reports')
    .update({ sent_to_owner: true, sent_at: new Date() })
    .eq('id', report.id)

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Triggered**: Automatically after `generateWeeklyReport` completes

---

### 3. Auto-Clean Old Data Function

**File**: `functions/archiveOldData.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_KEY')
  )

  // Find reports sent 7+ days ago
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const { data: oldReports } = await supabase
    .from('weekly_reports')
    .select('week_number')
    .eq('sent_to_owner', true)
    .lt('sent_at', sevenDaysAgo.toISOString())

  if (!oldReports || oldReports.length === 0) {
    return new Response(JSON.stringify({ archived: 0 }), { status: 200 })
  }

  // Delete transactions from old weeks
  const weekNumbers = oldReports.map(r => r.week_number)
  
  await supabase
    .from('transactions')
    .delete()
    .in('week_number', weekNumbers)

  return new Response(JSON.stringify({ success: true, archived: oldReports.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

**Triggered**: Every Monday at 01:00 UTC (day after reports sent)

---

## ⏰ Scheduled Jobs (Cron)

Supabase supports scheduled function invocations:

```yaml
# cron.yaml
functions:
  - name: generateWeeklyReport
    schedule: "0 23 * * 0"  # Sunday 23:00
    
  - name: sendWhatsAppReport
    schedule: "15 23 * * 0"  # Sunday 23:15 (after generation)
    
  - name: archiveOldData
    schedule: "0 1 * * 1"   # Monday 01:00
```

---

## 🔐 Row-Level Security (RLS) Policy Flow

```
Request comes in from frontend
  ↓
Auth middleware checks JWT token
  ↓
Extract role from JWT (admin or worker)
  ↓
Apply RLS policy to query
  ↓
Example for transactions SELECT:
  - If worker role → only see own transactions
  - If admin role → see all transactions
  ↓
Return filtered results
```

**Why RLS?**
- Security at database level (not just app level)
- Can't bypass even if someone hacks the frontend
- Impossible to access other workers' data without admin role

---

## 🗂️ Supabase Storage (Files)

Store PDFs and potentially room photos:

```
bucket: reports/
├── week_1_1713696000000.pdf
├── week_2_1713782400000.pdf
└── ...

bucket: photos/
├── room_1.jpg
├── room_2.jpg
└── ...
```

**Access Control**: 
- Reports only accessible by admin (RLS on storage)
- Photos public (for public booking pages later)

---

## 🔌 Connection Example (Frontend → Backend)

```javascript
// Frontend (React/Vue)
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-public-key'  // NOT secret; public key is fine
)

// 1. Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'worker@guesthouse.com',
  password: 'secure-password'
})

// 2. Create transaction (auto-inserts worker_id from auth)
const { data: transaction, error } = await supabase
  .from('transactions')
  .insert({
    room_id: '12345',
    amount_rwf: 5000,
    stay_type: 'short_stay',
    check_in_time: new Date().toISOString()
  })

// 3. Subscribe to real-time updates
supabase
  .from('transactions')
  .on('INSERT', ({ new: newTransaction }) => {
    console.log('New transaction:', newTransaction)
  })
  .subscribe()
```

---

## 📊 Performance Optimization

**Database Indexes** (already in schema above):
- `idx_transactions_created_at`: Fast date filtering
- `idx_transactions_week_number`: Fast report generation
- `idx_transactions_status`: Fast active/completed filtering

**Caching Strategy**:
- Daily snapshots table prevents recomputing daily totals
- Browser caches room list (rarely changes)
- WebSocket subscriptions prevent unnecessary polling

**Pagination**:
- Frontend requests transactions in batches of 50
- Prevents loading entire year at once

---

## 🚨 Error Handling & Validation

Backend validations (can't be bypassed):

```sql
-- Amount must be positive
CHECK (amount_rwf > 0)

-- Stay type must be valid
CHECK (stay_type IN ('short_stay', 'full_night'))

-- Status must be valid
CHECK (status IN ('active', 'completed', 'cancelled'))

-- Check-out can't be before check-in
CREATE TRIGGER validate_checkout BEFORE UPDATE ON transactions
FOR EACH ROW
EXECUTE FUNCTION check_checkout_time();
```

---

## 🆚 Supabase vs. Building Custom Backend

| Feature | Supabase | Custom Node Server |
|---------|----------|-------------------|
| Real-time | ✅ Built-in WebSocket | Need Socket.io |
| Authentication | ✅ JWT + Postgres auth | Build from scratch |
| Database | ✅ PostgreSQL managed | Setup, manage, backup |
| Scalability | ✅ Automatic | Manual scaling |
| RLS Security | ✅ Database-level | App-level only |
| Cost (Free tier) | ✅ $0 | ❌ $5-10+/month |
| Time to market | ✅ Days | Weeks |

---

## 🎯 Deployment Checklist

- [ ] Create Supabase project (free tier)
- [ ] Run migrations (schema setup)
- [ ] Create RLS policies
- [ ] Deploy Edge Functions
- [ ] Set up Cron jobs
- [ ] Configure Twilio API keys in env
- [ ] Test email/WhatsApp integration
- [ ] Load test with realistic data volumes
- [ ] Set up monitoring/alerts

---

## 📚 Key Supabase Docs

- [PostgreSQL Setup](https://supabase.com/docs/guides/database)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Real-time Subscriptions](https://supabase.com/docs/guides/realtime)
- [Storage](https://supabase.com/docs/guides/storage)

---

**Summary**: We get a production-grade backend with zero server management, all the enterprise features, and it costs nothing. That's Supabase magic. 🚀
