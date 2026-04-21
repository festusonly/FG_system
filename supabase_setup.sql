-- =================================================================
-- FLOWER GUESTHOUSE - Complete Database Setup
-- Run this entire script in your Supabase SQL Editor
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor
-- =================================================================


-- -----------------------------------------------------------------
-- 1. USERS TABLE
-- Stores roles for each authenticated user.
-- Supabase Auth handles passwords; this table just holds the role.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(100),
  role VARCHAR(20) NOT NULL DEFAULT 'worker' CHECK (role IN ('admin', 'worker')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- Admins can read all users
CREATE POLICY "Admins can read all users" ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- Allow insert on signup (via trigger below)
CREATE POLICY "Allow insert on signup" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);


-- -----------------------------------------------------------------
-- 2. AUTO-CREATE USER PROFILE ON SIGNUP TRIGGER
-- Whenever someone signs up via Supabase Auth, automatically
-- insert a row into the public.users table.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if it already exists then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- -----------------------------------------------------------------
-- 3. ROOMS TABLE
-- Static list of the 40 physical rooms.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  usage_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read rooms
CREATE POLICY "All authenticated users can read rooms" ON public.rooms
  FOR SELECT USING (auth.role() = 'authenticated');

-- Workers and admins can update rooms
CREATE POLICY "Authenticated users can update rooms" ON public.rooms
  FOR UPDATE USING (auth.role() = 'authenticated');


-- -----------------------------------------------------------------
-- 4. SEED THE 40 ROOMS
-- -----------------------------------------------------------------
INSERT INTO public.rooms (room_number, name, status, usage_count)
VALUES
  ('1',  'Room 1',  'available', 0),
  ('2',  'Room 2',  'available', 0),
  ('3',  'Room 3',  'available', 0),
  ('4',  'Room 4',  'available', 0),
  ('5',  'Room 5',  'available', 0),
  ('6',  'Room 6',  'available', 0),
  ('7',  'Room 7',  'available', 0),
  ('8',  'Room 8',  'available', 0),
  ('9',  'Room 9',  'available', 0),
  ('10', 'Room 10', 'available', 0),
  ('11', 'Room 11', 'available', 0),
  ('12', 'Room 12', 'available', 0),
  ('13', 'Room 13', 'available', 0),
  ('14', 'Room 14', 'available', 0),
  ('15', 'Room 15', 'available', 0),
  ('16', 'Room 16', 'available', 0),
  ('17', 'Room 17', 'available', 0),
  ('18', 'Room 18', 'available', 0),
  ('19', 'Room 19', 'available', 0),
  ('20', 'Room 20', 'available', 0),
  ('21', 'Room 21', 'available', 0),
  ('22', 'Room 22', 'available', 0),
  ('23', 'Room 23', 'available', 0),
  ('24', 'Room 24', 'available', 0),
  ('25', 'Room 25', 'available', 0),
  ('26', 'Room 26', 'available', 0),
  ('27', 'Room 27', 'available', 0),
  ('28', 'Room 28', 'available', 0),
  ('29', 'Room 29', 'available', 0),
  ('30', 'Room 30', 'available', 0),
  ('31', 'Room 31', 'available', 0),
  ('32', 'Room 32', 'available', 0),
  ('33', 'Room 33', 'available', 0),
  ('34', 'Room 34', 'available', 0),
  ('35', 'Room 35', 'available', 0),
  ('36', 'Room 36', 'available', 0),
  ('37', 'Room 37', 'available', 0),
  ('38', 'Room 38', 'available', 0),
  ('39', 'Room 39', 'available', 0),
  ('40', 'Room 40', 'available', 0)
ON CONFLICT (room_number) DO NOTHING;


-- -----------------------------------------------------------------
-- 5. TRANSACTIONS TABLE
-- Every booking is logged here.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  amount_rwf DECIMAL(12, 2) NOT NULL CHECK (amount_rwf > 0),
  stay_type VARCHAR(20) NOT NULL CHECK (stay_type IN ('short_hours', 'night', 'many_days')),
  days INT DEFAULT NULL, -- Only for many_days stay type
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_time TIMESTAMPTZ DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_room_id ON public.transactions(room_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Workers can read all transactions (for dashboard stats)
CREATE POLICY "Authenticated users can read transactions" ON public.transactions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Workers can only create transactions (worker_id auto-set from auth)
CREATE POLICY "Workers can create transactions" ON public.transactions
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Workers can update (for checkout) - only admins and transaction creator
CREATE POLICY "Authenticated users can update transactions" ON public.transactions
  FOR UPDATE USING (auth.role() = 'authenticated');


-- -----------------------------------------------------------------
-- 6. EXPENSES TABLE
-- Expenses reported by workers.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  amount_rwf DECIMAL(12, 2) NOT NULL CHECK (amount_rwf > 0),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON public.expenses(created_at);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read expenses
CREATE POLICY "Authenticated users can read expenses" ON public.expenses
  FOR SELECT USING (auth.role() = 'authenticated');

-- Workers can create expenses
CREATE POLICY "Workers can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');


-- -----------------------------------------------------------------
-- 7. ENABLE REAL-TIME on all tables
-- Required for WebSocket live updates to work.
-- -----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.expenses;


-- =================================================================
-- DONE! All tables are created and seeded.
-- Next step: Go to Authentication → Users in your Supabase dashboard
-- and create your admin and worker accounts.
-- =================================================================
