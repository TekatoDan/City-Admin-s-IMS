import { supabase } from './supabase';

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
  };
}

/**
 * Uploads a file to Supabase Storage and creates a metadata record in the database.
 */
export async function uploadDocument(
  file: File, 
  teamId: string, 
  folderId: string | null = null
): Promise<UploadedFileRecord> {
  // 1. Generate a unique storage path to prevent collisions
  const fileExt = file.name.split('.').pop();
  const uniqueId = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  const storagePath = `${teamId}/${uniqueId}.${fileExt}`;

  // 2. Upload the file to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  // 3. Create the file metadata record in the database
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
      files!inner(id, name, team_id, storage_path)
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
 * Retrieves all files for a specific team.
 */
export async function getTeamFiles(teamId: string): Promise<UploadedFileRecord[]> {
  const { data, error } = await supabase
    .from('files')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
