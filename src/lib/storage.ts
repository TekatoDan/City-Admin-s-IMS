import { supabase } from './supabase';

export interface FolderRecord {
  id: string;
  team_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface UploadedFileRecord {
  id: string;
  team_id: string;
  folder_id: string | null;
  name: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  status: string;
  created_at: string;
  created_by: string | null;
}

export interface SearchResult {
  id: string;
  content: string;
  files: {
    id: string;
    name: string;
    team_id: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    created_at: string;
    created_by: string | null;
  };
}

/**
 * Creates a new folder.
 */
export async function createFolder(teamId: string, name: string, parentId: string | null = null): Promise<FolderRecord> {
  const { data, error } = await supabase
    .from('folders')
    .insert({
      team_id: teamId,
      name,
      parent_id: parentId,
      created_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Retrieves folders for a specific team and parent folder.
 */
export async function getFolders(teamId: string, parentId: string | null = null): Promise<FolderRecord[]> {
  let query = supabase
    .from('folders')
    .select('*')
    .eq('team_id', teamId)
    .order('name', { ascending: true });
    
  if (parentId) {
    query = query.eq('parent_id', parentId);
  } else {
    query = query.is('parent_id', null).neq('name', '.archive');
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getArchiveFolder(teamId: string): Promise<FolderRecord> {
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('team_id', teamId)
    .is('parent_id', null)
    .eq('name', '.archive')
    .single();

  if (data) return data;

  // Create it if it doesn't exist
  const { data: newFolder, error: createError } = await supabase
    .from('folders')
    .insert({
      team_id: teamId,
      name: '.archive',
      parent_id: null,
      created_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (createError) throw createError;
  return newFolder;
}

export async function archiveFolder(folderId: string, teamId: string): Promise<void> {
  const archiveFolder = await getArchiveFolder(teamId);
  
  const { error } = await supabase
    .from('folders')
    .update({ parent_id: archiveFolder.id })
    .eq('id', folderId);

  if (error) throw error;
}

export async function archiveDocument(fileId: string, teamId: string): Promise<void> {
  const archiveFolder = await getArchiveFolder(teamId);
  
  const { error } = await supabase
    .from('files')
    .update({ folder_id: archiveFolder.id, status: 'archived' })
    .eq('id', fileId);

  if (error) throw error;
}

export async function restoreFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .update({ parent_id: null })
    .eq('id', folderId);

  if (error) throw error;
}

export async function restoreDocument(fileId: string): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ folder_id: null, status: 'draft' })
    .eq('id', fileId);

  if (error) throw error;
}

export async function moveFolder(folderId: string, newParentId: string | null): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .update({ parent_id: newParentId })
    .eq('id', folderId);

  if (error) throw error;
}

export async function moveDocument(fileId: string, newFolderId: string | null): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ folder_id: newFolderId })
    .eq('id', fileId);

  if (error) throw error;
}

/**
 * Deletes a folder and all its contents (cascade delete handles files in DB, but we need to remove from storage).
 * Note: For a complete solution, we'd need to recursively delete files from storage.
 * For now, we'll delete the folder record, and Supabase cascade will delete file records.
 * A database trigger or edge function should ideally clean up the storage bucket.
 */
export async function deleteFolder(folderId: string): Promise<void> {
  const { error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId);

  if (error) throw error;
}

/**
 * Uploads a file to Supabase Storage and creates a metadata record in the database.
 */
export async function uploadDocument(
  file: File, 
  teamId: string, 
  folderId: string | null = null
): Promise<UploadedFileRecord> {
  // 1. Check if a file with the same name already exists in this location
  let query = supabase
    .from('files')
    .select('id')
    .eq('team_id', teamId)
    .eq('name', file.name);
    
  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  const { data: existingFiles, error: checkError } = await query;
  
  if (checkError) throw checkError;
  
  if (existingFiles && existingFiles.length > 0) {
    throw new Error(`A file named "${file.name}" already exists in this location.`);
  }

  // 2. Generate a unique storage path to prevent collisions
  const fileExt = file.name.split('.').pop();
  const uniqueId = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  const storagePath = `${teamId}/${uniqueId}.${fileExt}`;

  // 3. Upload the file to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // 4. Create the file metadata record in the database
  const { data: fileRecord, error: dbError } = await supabase
    .from('files')
    .insert({
      team_id: teamId,
      folder_id: folderId,
      name: file.name,
      storage_path: storagePath,
      size_bytes: file.size,
      mime_type: file.type,
      status: 'draft',
      created_by: (await supabase.auth.getUser()).data.user?.id
    })
    .select()
    .single();

  if (dbError) {
    // Rollback storage upload if DB insert fails
    await supabase.storage.from('documents').remove([storagePath]);
    throw dbError;
  }

  return fileRecord;
}

/**
 * Saves the parsed text content of a file to the database for searching.
 */
export async function saveDocumentContent(fileId: string, content: string) {
  const { error } = await supabase
    .from('document_contents')
    .insert({
      file_id: fileId,
      chunk_index: 0,
      content: content
    });

  if (error) throw error;
}

/**
 * Searches the contents of documents within a specific team.
 */
export interface SearchFilters {
  fileType?: string;
  dateModified?: string;
  owner?: string;
}

export async function searchDocuments(teamId: string, query: string, filters?: SearchFilters): Promise<SearchResult[]> {
  const hasQuery = query.trim().length > 0;
  const hasFilters = filters && Object.values(filters).some(v => v !== 'all' && v !== 'any' && v !== 'anyone');

  if (!hasQuery && !hasFilters) return [];

  if (hasQuery) {
    // Search document contents
    let contentQuery = supabase
      .from('document_contents')
      .select(`
        id,
        content,
        files!inner(id, name, team_id, storage_path, mime_type, size_bytes, created_at, status, created_by)
      `)
      .eq('files.team_id', teamId)
      .neq('files.status', 'archived')
      .ilike('content', `%${query}%`);

    // Search file names
    let nameQuery = supabase
      .from('files')
      .select(`
        id, name, team_id, storage_path, mime_type, size_bytes, created_at, status, created_by
      `)
      .eq('team_id', teamId)
      .neq('status', 'archived')
      .ilike('name', `%${query}%`);

    if (filters) {
      if (filters.fileType && filters.fileType !== 'all') {
        if (filters.fileType === 'pdf') {
          contentQuery = contentQuery.eq('files.mime_type', 'application/pdf');
          nameQuery = nameQuery.eq('mime_type', 'application/pdf');
        } else if (filters.fileType === 'image') {
          contentQuery = contentQuery.like('files.mime_type', 'image/%');
          nameQuery = nameQuery.like('mime_type', 'image/%');
        } else if (filters.fileType === 'document') {
          contentQuery = contentQuery.in('files.mime_type', [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ]);
          nameQuery = nameQuery.in('mime_type', [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ]);
        } else if (filters.fileType === 'spreadsheet') {
          contentQuery = contentQuery.in('files.mime_type', [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
          ]);
          nameQuery = nameQuery.in('mime_type', [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
          ]);
        }
      }

      if (filters.dateModified && filters.dateModified !== 'any') {
        const now = new Date();
        let dateThreshold = new Date();
        
        if (filters.dateModified === 'today') {
          dateThreshold.setHours(0, 0, 0, 0);
        } else if (filters.dateModified === '7days') {
          dateThreshold.setDate(now.getDate() - 7);
        } else if (filters.dateModified === '30days') {
          dateThreshold.setDate(now.getDate() - 30);
        } else if (filters.dateModified === 'year') {
          dateThreshold.setFullYear(now.getFullYear() - 1);
        }
        
        contentQuery = contentQuery.gte('files.created_at', dateThreshold.toISOString());
        nameQuery = nameQuery.gte('created_at', dateThreshold.toISOString());
      }

      if (filters.owner && filters.owner !== 'anyone') {
        contentQuery = contentQuery.eq('files.created_by', filters.owner);
        nameQuery = nameQuery.eq('created_by', filters.owner);
      }
    }

    const [contentRes, nameRes] = await Promise.all([
      contentQuery.limit(20),
      nameQuery.limit(20)
    ]);

    if (contentRes.error) throw contentRes.error;
    if (nameRes.error) throw nameRes.error;
    
    const results: SearchResult[] = (contentRes.data as unknown) as SearchResult[];
    
    // Merge name results, avoiding duplicates
    const existingFileIds = new Set(results.map(r => r.files.id));
    
    for (const file of (nameRes.data || [])) {
      if (!existingFileIds.has(file.id)) {
        results.push({
          id: `name-${file.id}`,
          content: '',
          files: file as UploadedFileRecord
        });
        existingFileIds.add(file.id);
      }
    }
    
    return results;
  } else {
    // No text query, just filters. Search the files table directly.
    let dbQuery = supabase
      .from('files')
      .select(`
        id, name, team_id, storage_path, mime_type, size_bytes, created_at, status, created_by
      `)
      .eq('team_id', teamId)
      .neq('status', 'archived');

    if (filters) {
      if (filters.fileType && filters.fileType !== 'all') {
        if (filters.fileType === 'pdf') {
          dbQuery = dbQuery.eq('mime_type', 'application/pdf');
        } else if (filters.fileType === 'image') {
          dbQuery = dbQuery.like('mime_type', 'image/%');
        } else if (filters.fileType === 'document') {
          dbQuery = dbQuery.in('mime_type', [
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain'
          ]);
        } else if (filters.fileType === 'spreadsheet') {
          dbQuery = dbQuery.in('mime_type', [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
          ]);
        }
      }

      if (filters.dateModified && filters.dateModified !== 'any') {
        const now = new Date();
        let dateThreshold = new Date();
        
        if (filters.dateModified === 'today') {
          dateThreshold.setHours(0, 0, 0, 0);
        } else if (filters.dateModified === '7days') {
          dateThreshold.setDate(now.getDate() - 7);
        } else if (filters.dateModified === '30days') {
          dateThreshold.setDate(now.getDate() - 30);
        } else if (filters.dateModified === 'year') {
          dateThreshold.setFullYear(now.getFullYear() - 1);
        }
        
        dbQuery = dbQuery.gte('created_at', dateThreshold.toISOString());
      }

      if (filters.owner && filters.owner !== 'anyone') {
        dbQuery = dbQuery.eq('created_by', filters.owner);
      }
    }

    const { data, error } = await dbQuery.order('created_at', { ascending: false }).limit(20);

    if (error) throw error;

    // Map to SearchResult format
    return (data || []).map(file => ({
      id: file.id,
      content: '', // No content match
      files: file as unknown as SearchResult['files']
    }));
  }
}

/**
 * Generates a secure, short-lived pre-signed URL for downloading a file.
 */
export async function getSignedDownloadUrl(storagePath: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error) throw error;
  return data.signedUrl;
}

/**
 * Retrieves all files for a specific team and folder.
 */
export async function getTeamFiles(teamId: string, folderId: string | null = null): Promise<UploadedFileRecord[]> {
  let query = supabase
    .from('files')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (folderId) {
    query = query.eq('folder_id', folderId);
  } else {
    query = query.is('folder_id', null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function getStarredFiles(teamId: string, fileIds: string[]): Promise<UploadedFileRecord[]> {
  if (fileIds.length === 0) return [];
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('team_id', teamId)
    .in('id', fileIds)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getStarredFolders(teamId: string, folderIds: string[]): Promise<FolderRecord[]> {
  if (folderIds.length === 0) return [];
  const { data, error } = await supabase
    .from('folders')
    .select('*')
    .eq('team_id', teamId)
    .in('id', folderIds)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Retrieves recently uploaded or modified files for a specific team.
 */
export async function getRecentFiles(teamId: string, limit: number = 20): Promise<UploadedFileRecord[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('team_id', teamId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Updates the name of a document.
 */
export async function updateDocumentName(fileId: string, newName: string): Promise<void> {
  const { error } = await supabase
    .from('files')
    .update({ name: newName })
    .eq('id', fileId);

  if (error) throw error;
}

/**
 * Deletes a document from storage and the database.
 */
export async function deleteDocument(fileId: string, storagePath: string): Promise<void> {
  // 1. Delete from storage bucket
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([storagePath]);

  if (storageError) throw storageError;

  // 2. Delete from database (cascade will handle document_contents)
  const { error: dbError } = await supabase
    .from('files')
    .delete()
    .eq('id', fileId);

  if (dbError) throw dbError;
}
