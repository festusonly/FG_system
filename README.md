# Guesthouse Digital Management System

A progressive web app (PWA) designed to automate payment tracking and reporting for family-run guesthouses. Replaces manual paper and SMS systems with a simple, real-time digital solution.

## 🎯 Project Overview

This project transforms how the guesthouse operates by:
- **Eliminating manual reporting**: Workers no longer send SMS updates
- **Ensuring financial accuracy**: Every RWF is logged in real-time with timestamps
- **Simplifying operations**: Staff with minimal tech skills can operate the system with big buttons and no typing
- **Automating insights**: Owner receives weekly PDF reports automatically via WhatsApp

## 📋 Objectives

1. **Eliminate Manual Reporting** - Remove dependency on SMS updates and paper tracking
2. **Financial Accuracy** - Real-time tracking of all payments, categorized by room and stay type
3. **Ease of Use** - "Zero-Learning" interface requiring no technical training
4. **Automatic Archiving** - Weekly PDF reports stored permanently and sent to owner
5. **Zero Monthly Cost** - Leverage free-tier cloud services (Supabase + PWA)

## 📊 Current vs. New Workflow

### Current Manual Process
1. Worker accepts money → writes amount on paper
2. Worker sends SMS to owner with payment details
3. Owner manually tracks which rooms are occupied/vacant
4. No easy way to see weekly totals or trends

### New Digital Process
1. Worker taps room number on phone → system logs instantly
2. Worker toggles stay type (Short/Full Night) → categorized automatically
3. Owner opens dashboard → sees live totals, active guests, room status in real-time
4. Every Sunday → PDF report generated + sent via WhatsApp
5. Previous week's data auto-cleared to maintain performance

## ✨ Key Features

### A. Worker Portal (Mobile-First)

**Big-Button Interface**
- No typing required
- Large room number buttons (Room 1, 2, 3, etc.)
- Simple toggle for stay type: "Short Stay" (hourly) or "Full Night" (overnight)
- Amount input field for payment receipt

**Instant Sync**
- Data uploads immediately when internet is available
- If offline, stores locally and automatically syncs when reconnected
- Visual indicator showing sync status

**Session Management**
- View/edit active room sessions
- Mark room as "Guest Left" with final amount
- See timestamp of all transactions

---

### B. Admin Dashboard (Owner View)

**Live Metrics**
- Total cash collected today (real-time counter)
- Number of active guests
- Room availability status
- Average stay duration

**History Logs**
- Detailed transaction ledger with timestamps
- Filter by date range, room, or stay type
- Search functionality

**Occupancy Heatmap**
- Visual representation of which rooms are used most frequently
- Breakdown: Short Stay vs. Full Night usage
- Helps identify peak rooms for maintenance planning

**Weekly Reports**
- Professional PDF generated every Sunday at specified time
- Includes: revenue totals, room breakdown, occupancy stats, trends
- Auto-sent to owner's WhatsApp

---

### C. Automated Reporting Engine

**Weekly PDF Generation**
- Triggers automatically every Sunday night
- Professional formatting with:
  - Total revenue collected
  - Revenue breakdown by room
  - Revenue breakdown by stay type
  - Occupancy statistics
  - Trends and insights

**WhatsApp Integration**
- Report automatically sent to owner's registered phone
- Uses Twilio or similar service (free tier compatible)

**Self-Cleaning Database**
- After report is successfully sent, previous week's data is archived/deleted
- Keeps database lean and query performance optimal
- Maintains database on free tier without hitting limits

---

## 🛠️ Technical Strategy

### Architecture

**Frontend: Progressive Web App (PWA)**
- React or Vue.js for responsive UI
- Offline-first capability (Service Workers)
- Installable on home screen like native app
- Works on any browser (desktop, tablet, mobile)

**Backend: Supabase (PostgreSQL)**
- Real-time database updates via WebSocket
- Built-in authentication for workers and admin
- Automatic backups
- Free tier: sufficient for guesthouse scale

**Hosting: Vercel or Netlify**
- Automatic deployments from Git
- Free tier supports this project
- Global CDN for fast performance

### Database Schema (Simplified)

```
Users Table
├── id (UUID)
├── role (admin / worker)
├── name
├── phone
└── password_hash

Rooms Table
├── id (UUID)
├── room_number
└── status (available / occupied)

Transactions Table
├── id (UUID)
├── room_id (FK)
├── worker_id (FK)
├── amount (RWF)
├── stay_type (short_stay / full_night)
├── check_in_time
├── check_out_time (nullable)
├── created_at
└── status (active / completed)

Reports Table
├── id (UUID)
├── week_number
├── total_revenue
├── created_at
└── sent_to_owner (boolean)
```

### Security

- Password-protected login for both workers and admin
- Role-based access control (RBAC):
  - **Workers**: Can only log payments to assigned rooms
  - **Admin**: Full dashboard access + settings
- HTTPS encryption for all data in transit
- Environment variables for API keys (never hardcoded)

## 📁 Project Structure (To Be Built)

```
flower_system/
├── README.md                 # This file
├── .env.example              # Template for environment variables
├── .gitignore
│
├── frontend/                 # React/Vue PWA
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── WorkerPortal.jsx
│   │   │   ├── AdminDashboard.jsx
│   │   │   └── ...
│   │   ├── pages/
│   │   ├── services/        # API calls, auth
│   │   ├── store/           # State management
│   │   ├── styles/
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── backend/                  # Supabase Functions + Config
│   ├── functions/           # Edge functions
│   │   ├── generateWeeklyReport.js
│   │   ├── sendWhatsAppReport.js
│   │   └── archiveOldData.js
│   ├── migrations/          # Database schema
│   └── config/
│
└── docs/
    ├── SETUP.md            # Installation guide
    ├── API.md              # API documentation
    └── DEPLOYMENT.md       # Deployment instructions
```

## 🚀 Development Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Set up project repository
- [ ] Design database schema in Supabase
- [ ] Create basic authentication system
- [ ] Build worker portal UI (big button layout)
- [ ] Implement payment logging functionality

### Phase 2: Admin & Real-time (Week 3-4)
- [ ] Build admin dashboard with live metrics
- [ ] Implement real-time sync (WebSocket)
- [ ] Add room occupancy heatmap
- [ ] Create history/transaction logs

### Phase 3: Automation & Reporting (Week 5-6)
- [ ] Build PDF report generator
- [ ] Integrate WhatsApp API
- [ ] Implement automatic weekly report scheduling
- [ ] Build self-cleaning database logic
- [ ] Set up automated job scheduler (Cron)

### Phase 4: Polish & Deployment (Week 7+)
- [ ] Offline-first capability & Service Workers
- [ ] Performance optimization
- [ ] Security audit
- [ ] Testing (unit + integration)
- [ ] Deploy to production
- [ ] User training & documentation

### Phase 5: Advanced Features & Localization (Future)
- [ ] **Kinyarwanda Support:** Add a language toggle to translate the entire UI for local staff.
- [ ] **Daily Client Tracking:** Show total clients of the day and specific rooms occupied on both Admin and Staff portals.
- [ ] **7-Day Rolling History:** A dedicated Admin page showing day-by-day sales, room usage, and expenses for the past week.
- [ ] **Auto-Deletion Cron Job:** Automatically delete daily history data older than 7 days to maintain database speed and free-tier limits.

## 💰 Cost Breakdown (Monthly)

| Service | Free Tier | Cost |
|---------|-----------|------|
| Supabase | 500MB storage + 25M egress | FREE |
| Vercel/Netlify Hosting | Unlimited deployments | FREE |
| Twilio (WhatsApp) | ~$0.005/message | ~$2-5/month |
| **Total** | | ~$0-5/month |

*Target: $0 RWF/month for the core system*

## 🔐 Security Features

- Password-protected login (workers & admin)
- Role-based access control
- HTTPS encryption
- Rate limiting on API endpoints
- Input validation and sanitization
- No storing sensitive data in browser localStorage
- Automatic session timeout

## 📱 Responsiveness

- Desktop: Full dashboard view
- Tablet: Optimized touch interface
- Mobile: Worker portal (simplified, large buttons)

## 🎓 Learning Goals

Through building this project, you'll master:
- Progressive Web Apps (PWA)
- Real-time database updates (Supabase)
- React component architecture
- API integration (WhatsApp, scheduling)
- Database design & optimization
- State management
- Offline-first development
- PDF generation
- Deployment & DevOps basics

## 📝 Next Steps

1. **Set up the development environment**: Node.js, npm, Git
2. **Create Supabase project**: Initialize database
3. **Set up React project**: With Vite for fast development
4. **Begin Phase 1**: Database schema & authentication
5. **Iterate & test**: Weekly demos to owner if needed

## 📞 Support & Documentation

- Detailed setup instructions: See `SETUP.md`
- API documentation: See `API.md`
- Deployment guide: See `DEPLOYMENT.md`

---

**Status**: Planning phase ✏️
**Last Updated**: April 21, 2026
**Team**: Development in progress 🚀
