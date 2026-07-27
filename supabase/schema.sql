-- TailorCV Supabase schema (optional for MVP persistence)
-- Run in the Supabase SQL editor after creating a project.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  full_name text not null,
  location text default '',
  email text not null,
  phone text default '',
  linkedin_url text default '',
  summary text default '',
  skills jsonb default '[]'::jsonb,
  experiences jsonb default '[]'::jsonb,
  education jsonb default '[]'::jsonb,
  certifications jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  job_title text default '',
  company_name text default '',
  job_description text not null,
  options jsonb not null default '{}'::jsonb,
  resume jsonb not null,
  cover_letter jsonb not null,
  matched_keywords jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid references generations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  document_type text not null check (document_type in ('resume', 'cover_letter')),
  format text not null check (format in ('pdf', 'docx')),
  storage_path text not null,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table generations enable row level security;
alter table exports enable row level security;

create policy "Users manage own profiles"
  on profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own generations"
  on generations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own exports"
  on exports for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create a private Storage bucket named "resumes" in the Supabase dashboard.
