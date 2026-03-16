import { supabase } from './supabase';

export interface FolderRecord {
  id: string;
  team_id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
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
    query = query.is('parent_id', null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
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
export async function searchDocuments(teamId: string, query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const { data, error } = await supabase
    .from('document_contents')
    .select(`
      id,
      content,
      files!inner(id, name, team_id, storage_path, mime_type, size_bytes, created_at)
    `)
    .eq('files.team_id', teamId)
    .ilike('content', `%${query}%`)
    .limit(10);

  if (error) throw error;
  
  // Type assertion because Supabase's generated types for joins can be complex
  return (data as unknown) as SearchResult[];
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
