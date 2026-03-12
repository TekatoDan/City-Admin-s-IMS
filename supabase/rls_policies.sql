-- ========================================================================================
-- Central Collaboration Hub - Phase 3: Advanced RLS Policies (Backend Middleware)
-- ========================================================================================
-- These policies act as the backend security middleware, ensuring that even if the
-- frontend is bypassed, users can only access data they have explicit permission for.

-- ----------------------------------------------------------------------------------------
-- TEAMS & TEAM MEMBERS
-- ----------------------------------------------------------------------------------------

-- Users can view teams they are a member of
create policy "Users can view teams they belong to"
  on public.teams for select
  using ( exists (
    select 1 from public.team_members 
    where team_id = teams.id and user_id = auth.uid()
  ));

-- Only team admins or owners can update team details
create policy "Admins and owners can update team"
  on public.teams for update
  using ( exists (
    select 1 from public.team_members 
    where team_id = teams.id and user_id = auth.uid() and role in ('admin', 'owner')
  ));

-- Users can view members of their teams
create policy "Users can view team members"
  on public.team_members for select
  using ( exists (
    select 1 from public.team_members tm 
    where tm.team_id = team_members.team_id and tm.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------------------------
-- FOLDERS
-- ----------------------------------------------------------------------------------------

-- Users can view folders in their teams
create policy "Users can view team folders"
  on public.folders for select
  using ( exists (
    select 1 from public.team_members 
    where team_id = folders.team_id and user_id = auth.uid()
  ));

-- Members, admins, and owners can create folders
create policy "Authorized users can create folders"
  on public.folders for insert
  with check ( exists (
    select 1 from public.team_members 
    where team_id = folders.team_id and user_id = auth.uid() and role in ('member', 'admin', 'owner')
  ));

-- ----------------------------------------------------------------------------------------
-- FILES & FILE PERMISSIONS
-- ----------------------------------------------------------------------------------------

-- Users can view files if they are in the team OR have explicit file permissions
create policy "Users can view files based on team or explicit permission"
  on public.files for select
  using ( 
    exists (
      select 1 from public.team_members 
      where team_id = files.team_id and user_id = auth.uid()
    ) OR 
    exists (
      select 1 from public.file_permissions
      where file_id = files.id and user_id = auth.uid()
    )
  );

-- Users can insert files if they have team write access
create policy "Authorized users can upload files"
  on public.files for insert
  with check ( exists (
    select 1 from public.team_members 
    where team_id = files.team_id and user_id = auth.uid() and role in ('member', 'admin', 'owner')
  ));

-- Users can update files (e.g., rename, move) if they have team write access OR explicit file write access
create policy "Authorized users can update files"
  on public.files for update
  using ( 
    exists (
      select 1 from public.team_members 
      where team_id = files.team_id and user_id = auth.uid() and role in ('member', 'admin', 'owner')
    ) OR 
    exists (
      select 1 from public.file_permissions
      where file_id = files.id and user_id = auth.uid() and permission in ('write', 'admin')
    )
  );

-- ----------------------------------------------------------------------------------------
-- DOCUMENT CONTENTS (Search Index)
-- ----------------------------------------------------------------------------------------

-- Users can only search/view document contents if they have read access to the parent file
create policy "Users can view document contents of accessible files"
  on public.document_contents for select
  using ( exists (
    select 1 from public.files
    where id = document_contents.file_id
  )); -- Relies on the files SELECT policy to cascade security

-- ----------------------------------------------------------------------------------------
-- STORAGE POLICIES (Supabase Storage)
-- ----------------------------------------------------------------------------------------
-- Note: You must create a storage bucket named 'documents' in the Supabase Dashboard first.

-- create policy "Users can view files in their teams"
--   on storage.objects for select
--   using ( bucket_id = 'documents' and exists (
--     select 1 from public.files
--     where storage_path = storage.objects.name
--   ));
