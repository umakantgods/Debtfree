-- DebtFree — Database Schema
-- Run via: supabase db push  (or paste into Supabase SQL editor)

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- profiles: 1 row per auth user (public-safe fields only)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  currency text not null default 'INR',
  monthly_income numeric(12,2),
  onboarding_completed boolean not null default false,
  preferred_strategy text check (preferred_strategy in ('avalanche','snowball','recommended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- debts
-- ---------------------------------------------------------------------
create table if not exists debts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_type text not null check (debt_type in (
    'credit_card','personal_loan','home_loan','vehicle_loan',
    'education_loan','bnpl','consumer_emi','friends_family','other'
  )),
  lender text,
  original_amount numeric(12,2) not null check (original_amount >= 0),
  balance numeric(12,2) not null check (balance >= 0),
  interest_rate numeric(5,2) not null check (interest_rate >= 0 and interest_rate <= 100),
  min_payment numeric(12,2) not null check (min_payment >= 0),
  due_day int check (due_day between 1 and 31),
  remaining_tenure_months int check (remaining_tenure_months >= 0),
  notes text,
  status text not null default 'active' check (status in ('active','paid_off','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_debts_user on debts(user_id);
create index if not exists idx_debts_status on debts(user_id, status);

-- ---------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_user on payments(user_id);
create index if not exists idx_payments_debt on payments(debt_id, payment_date);

-- ---------------------------------------------------------------------
-- budgets: one row per user, editable "monthly debt budget" (spec §16)
-- ---------------------------------------------------------------------
create table if not exists budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric(12,2),
  essential_expenses numeric(12,2),
  emergency_buffer numeric(12,2),
  available_for_debt numeric(12,2),
  extra_payment numeric(12,2),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- monthly_plans: snapshot of the computed plan for a given month (cache/audit trail)
-- ---------------------------------------------------------------------
create table if not exists monthly_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_month date not null, -- first of month
  strategy text not null check (strategy in ('avalanche','snowball')),
  total_budget numeric(12,2) not null,
  target_debt_id uuid references debts(id),
  extra_payment numeric(12,2) not null default 0,
  projected_debt_free_date date,
  projected_total_interest numeric(14,2),
  created_at timestamptz not null default now(),
  unique(user_id, plan_month)
);
create index if not exists idx_plans_user on monthly_plans(user_id, plan_month);

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('due_soon','payment_recorded','debt_cleared','milestone','system')),
  title text not null,
  body text,
  related_debt_id uuid references debts(id),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications(user_id, read, created_at desc);

-- ---------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'INR',
  notifications_enabled boolean not null default true,
  reminder_days_before int not null default 3,
  theme text not null default 'light',
  updated_at timestamptz not null default now()
);

-- =======================================================================
-- Row Level Security — every user can only ever see their own rows.
-- =======================================================================
alter table profiles enable row level security;
alter table debts enable row level security;
alter table payments enable row level security;
alter table budgets enable row level security;
alter table monthly_plans enable row level security;
alter table notifications enable row level security;
alter table user_settings enable row level security;

create policy "profiles_own_row" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "debts_own_rows" on debts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "payments_own_rows" on payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "budgets_own_row" on budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "monthly_plans_own_rows" on monthly_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "notifications_own_rows" on notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_settings_own_row" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- Trigger: auto-create profile + settings row on signup
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- Trigger: bump updated_at automatically
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_debts_updated_at before update on debts
  for each row execute procedure public.set_updated_at();
create trigger trg_profiles_updated_at before update on profiles
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------
-- Admin aggregate view (spec §33) — no individual financial data exposed.
-- Grant access to this view only to a service role / admin-flagged user.
-- ---------------------------------------------------------------------
create or replace view admin_aggregate_stats as
select
  (select count(*) from auth.users) as total_users,
  (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days') as active_users_30d,
  (select count(*) from auth.users where created_at > now() - interval '7 days') as new_registrations_7d,
  (select count(*) from debts where status = 'active') as total_active_debts,
  (select count(*) from payments) as total_payments_recorded,
  (select coalesce(sum(balance),0) from debts where status = 'active') as total_debt_aggregate;

-- ---------------------------------------------------------------------
-- Admin flag — separates admin capability from normal user accounts
-- (spec §33). Must be set manually per-admin, e.g.:
--   update profiles set is_admin = true where id = '<admin-user-uuid>';
-- Never settable by the user themselves via the app (no UI exposes this;
-- RLS on `profiles` still lets a user read/write their own row, but the
-- admin API route re-checks this flag server-side with the service role
-- key before returning any aggregate data — see /api/admin/stats).
-- ---------------------------------------------------------------------
alter table profiles add column if not exists is_admin boolean not null default false;

-- ---------------------------------------------------------------------
-- SECURITY: prevent self-promotion to admin.
--
-- The RLS policy above (`profiles_own_row`) lets a user update any column
-- on their own profile row, including `is_admin` — RLS only controls WHICH
-- rows you can touch, not which columns. Without this trigger, any user
-- could call `supabase.from('profiles').update({ is_admin: true })` from
-- their own browser and grant themselves admin access. This trigger blocks
-- that: `is_admin` can only be changed by the service-role key (used only
-- server-side), never by a normal user's session.
-- ---------------------------------------------------------------------
create or replace function public.prevent_is_admin_escalation()
returns trigger as $$
begin
  -- Block only when the change comes through PostgREST as a normal user
  -- session (anon/authenticated — i.e. the app's anon-key client, which is
  -- what a malicious browser request would use). auth.role() is NULL for
  -- direct SQL access (the Supabase SQL Editor, migrations) and equals
  -- 'service_role' for the admin API route — both of those are allowed.
  if new.is_admin is distinct from old.is_admin and auth.role() in ('anon', 'authenticated') then
    raise exception 'is_admin cannot be changed from a user session. Use the Supabase SQL Editor instead.';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_prevent_is_admin_escalation on profiles;
create trigger trg_prevent_is_admin_escalation
  before update on profiles
  for each row execute procedure public.prevent_is_admin_escalation();
