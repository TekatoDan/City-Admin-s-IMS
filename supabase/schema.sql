-- ========================================================================================
-- Central Collaboration Hub - Phase 2: Database Schema (PostgreSQL DDL)
-- ========================================================================================

-- Enable necessary extensions
create extension if not exists "uuid-ossp";
create extension if not exists vector; -- For semantic search (optional, but good to have ready)

-- 1. Users Table (Extends Supabase Auth)
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Teams Table
create table public.teams (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Team Members (RBAC at Team Level)
create type team_role as enum ('owner', 'admin', 'member', 'viewer');

create table public.team_members (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role team_role default 'member'::team_role not null,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(team_id, user_id)
);

-- 4. Folders Table (Hierarchical Structure)
create table public.folders (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  name text not null,
  parent_id uuid references public.folders(id) on delete cascade, -- Self-referencing for nested folders
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(team_id, parent_id, name) -- Prevent duplicate folder names in the same parent
);

-- 5. Files Table
create type file_status as enum ('draft', 'review', 'approved', 'archived');

create table public.files (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade not null,
  folder_id uuid references public.folders(id) on delete cascade, -- Null means root of team
  name text not null,
  description text,
  storage_path text not null, -- Path in Supabase Storage
  size_bytes bigint not null,
  mime_type text not null,
  version integer default 1 not null,
  status file_status default 'draft'::file_status not null,
  locked_by uuid references public.users(id) on delete set null, -- For check-in/check-out
  locked_at timestamp with time zone,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. File Permissions (Granular RBAC overriding Team Role)
create type permission_level as enum ('read', 'write', 'admin');

create table public.file_permissions (
  id uuid default uuid_generate_v4() primary key,
  file_id uuid references public.files(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  permission permission_level not null,
  granted_by uuid references public.users(id) on delete set null,
  granted_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(file_id, user_id)
);

-- 7. Document Contents (For Full-Text Search)
create table public.document_contents (
  id uuid default uuid_generate_v4() primary key,
  file_id uuid references public.files(id) on delete cascade not null,
  chunk_index integer not null, -- For large documents split into chunks
  content text not null,
  fts tsvector generated always as (to_tsvector('english', content)) stored, -- Full-Text Search Index
  embedding vector(1536), -- For future Semantic AI Search (OpenAI embeddings usually 1536 dims)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create an index on the tsvector column for fast full-text search
create index document_contents_fts_idx on public.document_contents using gin (fts);
-- Create an index for semantic search (HNSW index for pgvector)
create index document_contents_embedding_idx on public.document_contents using hnsw (embedding vector_cosine_ops);

-- 8. Audit Logs
create type audit_action as enum ('create', 'read', 'update', 'delete', 'download', 'lock', 'unlock', 'permission_change');

create table public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  team_id uuid references public.teams(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action audit_action not null,
  resource_type text not null, -- e.g., 'file', 'folder', 'team'
  resource_id uuid not null,
  details jsonb, -- Store changes, IP address, user agent, etc.
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ========================================================================================
-- Row Level Security (RLS) Policies (Foundation)
-- ========================================================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.folders enable row level security;
alter table public.files enable row level security;
alter table public.file_permissions enable row level security;
alter table public.document_contents enable row level security;
alter table public.audit_logs enable row level security;

-- Basic User Policies
create policy "Users can view their own profile"
  on public.users for select
  using ( auth.uid() = id );

create policy "Users can update their own profile"
  on public.users for update
  using ( auth.uid() = id );

-- (More complex RLS policies for Teams, Folders, and Files will be implemented in Phase 3)

-- ========================================================================================
-- Triggers
-- ========================================================================================

-- Trigger to automatically create a user profile when a new user signs up via Supabase Auth
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Trigger to update 'updated_at' timestamp
create or replace function update_modified_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_users_modtime before update on public.users for each row execute procedure update_modified_column();
create trigger update_teams_modtime before update on public.teams for each row execute procedure update_modified_column();
create trigger update_folders_modtime before update on public.folders for each row execute procedure update_modified_column();
create trigger update_files_modtime before update on public.files for each row execute procedure update_modified_column();
