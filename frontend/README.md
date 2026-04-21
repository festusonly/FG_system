# Frontend Project Structure

## Quick Setup

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Setup Environment Variables
Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

### 3. Run Development Server
```bash
npm run dev
```

The app will open at `http://localhost:3000`

## Architecture - Two Portals, One Backend

### Key Concept
- **Single Supabase Backend** handles all data
- **Two separate UI flows**:
  - `/staff` - Worker portal (big buttons, simple interface)
  - `/admin` - Admin dashboard (analytics, reports, management)
- **Role-based Access Control** - Enforced by Supabase Row-Level Security (RLS)

### Authentication Flow

```
User Visits App
    ↓
Check if logged in (Supabase auth)
    ↓
If not → Redirect to /login
    ↓
User enters credentials
    ↓
Supabase encrypts password, returns JWT token
    ↓
Query users table to get role (admin or worker)
    ↓
If admin role → Redirect to /admin
If worker role → Redirect to /staff
```

### URL Structure

| URL | Who Can Access | Purpose |
|-----|---|---|
| `/login` | Everyone | Login page (public) |
| `/staff` | Workers only | Payment logging interface |
| `/admin` | Admin only | Dashboard, analytics, reports |
| `/dashboard` | Logged-in users | Auto-redirects to /staff or /admin based on role |
| `/` | Everyone | Auto-redirects to /login or /dashboard |

### Protected Routes

All routes except `/login` are protected by the `ProtectedRoute` component:
- Checks if user is authenticated
- Checks if user has required role
- Auto-redirects if access denied

```jsx
<Route
  path="/staff"
  element={
    <ProtectedRoute requiredRole="worker">
      <StaffPortal />
    </ProtectedRoute>
  }
/>
```

## File Structure

```
frontend/
├── public/
│   └── index.html          # Main HTML file
├── src/
│   ├── components/         # Reusable UI components (future)
│   ├── pages/
│   │   ├── Login.jsx       # Shared login page
│   │   ├── StaffPortal.jsx # Worker dashboard (big buttons, room selection)
│   │   └── AdminDashboard.jsx # Owner dashboard (analytics, reports)
│   ├── services/
│   │   └── supabaseClient.js   # Supabase client setup
│   ├── context/
│   │   └── AuthContext.jsx     # Global auth state + useAuth hook
│   ├── styles/
│   │   ├── index.css           # Global styles
│   │   ├── Login.css           # Login page styles
│   │   ├── StaffPortal.css     # Staff portal styles
│   │   └── AdminDashboard.css  # Admin dashboard styles
│   ├── App.jsx             # Main app with routing
│   └── main.jsx            # React entry point
├── package.json
├── vite.config.js
├── .env.example
└── .gitignore
```

## How Two Portals Share One Backend

### 1. Authentication
Both portals use the same Supabase Auth:
```js
// In AuthContext.jsx
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password
})
```

### 2. Database Query with RLS
- Worker sees only their own transactions (RLS policy)
- Admin sees all transactions (RLS policy)
- Same `/transactions` table, different data visibility

```sql
-- Worker RLS Policy (in Supabase)
CREATE POLICY "Workers see own data"
  ON transactions FOR SELECT
  USING (worker_id = auth.uid());

-- Admin RLS Policy
CREATE POLICY "Admins see all data"
  ON transactions FOR SELECT
  USING (auth.jwt() ->> 'role' = 'admin');
```

### 3. Real-time Updates
Both portals receive live updates from the same database:
```jsx
// Both worker and admin listen to transaction changes
supabase
  .from('transactions')
  .on('INSERT', ({ new: transaction }) => {
    // Update UI
  })
  .subscribe();
```

## Key Components

### AuthContext (src/context/AuthContext.jsx)
Manages:
- Current user object
- User role (admin/worker)
- Login/logout functions
- Auth state (loading, error)

**Usage**: `const { user, role, login, logout } = useAuth()`

### ProtectedRoute (src/App.jsx)
Wraps routes to:
- Check if user is logged in
- Verify user has required role
- Auto-redirect if not authenticated

### Supabase Client (src/services/supabaseClient.js)
Singleton instance of Supabase for all API calls.

**Usage**: `import { supabase } from './services/supabaseClient'`

## Styling

Uses CSS with CSS variables for theming:
- Color scheme: Dark header, light content
- Responsive grid layouts
- Mobile-first design
- Smooth transitions and hover effects

## Next Steps for Development

1. **Connect real Supabase data**:
   - Replace mock data in components with actual API calls
   - Implement transaction creation/update/delete

2. **Add more features**:
   - Edit/cancel transactions
   - Room occupancy heatmap
   - Report generation
   - Staff management

3. **Performance optimization**:
   - Add pagination for transaction lists
   - Cache frequently accessed data
   - Lazy load components

4. **Testing**:
   - Unit tests for components
   - Integration tests with Supabase
   - E2E tests for auth flow

## Troubleshooting

### "Missing Supabase environment variables"
- Copy `.env.example` to `.env.local`
- Fill in your actual Supabase credentials
- Restart dev server

### Users redirected to wrong portal
- Check user's role in Supabase `users` table
- Make sure `role` field is set correctly (admin/worker)
- Verify RLS policies are enabled

### Login not working
- Check Supabase project is active
- Verify user exists in `auth.users` table
- Check password is correct
- Look at browser console for errors

