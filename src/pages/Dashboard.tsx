import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogOut, ShieldCheck, UploadCloud, File as FileIcon, Download, Loader2, Search, FileText } from 'lucide-react';
import { getDefaultTeam } from '../lib/teams';
import { uploadDocument, getTeamFiles, getSignedDownloadUrl, UploadedFileRecord, saveDocumentContent, searchDocuments, SearchResult } from '../lib/storage';
import { extractTextFromFile } from '../lib/parser';
import CollaborationPanel from '../components/CollaborationPanel';

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!user) return;
    
    const initialize = async () => {
      try {
        const team = await getDefaultTeam(user.id);
        setTeamId(team.id);
        const teamFiles = await getTeamFiles(team.id);
        setFiles(teamFiles);
      } catch (err: any) {
        setError(`Failed to load workspace data: ${err.message || JSON.stringify(err)}`);
        console.error(err);
      } finally {
        setLoadingFiles(false);
      }
    };

    initialize();
  }, [user]);

  // Handle Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 3 && teamId) {
        setSearching(true);
        try {
          const results = await searchDocuments(teamId, searchQuery);
          setSearchResults(results);
        } catch (err) {
          console.error('Search error:', err);
        } finally {
          setSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, teamId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !teamId) return;

    setUploading(true);
    setError(null);
    setUploadStatus('Uploading file to secure storage...');

    try {
      // 1. Upload file and create metadata record
      const newFileRecord = await uploadDocument(file, teamId);
      setFiles((prev) => [newFileRecord, ...prev]);

      // 2. Parse text from file (Client-side parsing for Phase 5)
      setUploadStatus('Parsing document contents for search index...');
      try {
        const extractedText = await extractTextFromFile(file);
        
        // 3. Save parsed text to database
        if (extractedText) {
          setUploadStatus('Saving to search index...');
          await saveDocumentContent(newFileRecord.id, extractedText);
        }
      } catch (parseError: any) {
        console.warn('Could not parse file text:', parseError);
        // We don't fail the whole upload if parsing fails (e.g., unsupported file type)
      }

    } catch (err: any) {
      console.error("Upload failed details:", err);
      setError(`Upload failed: ${err.message || JSON.stringify(err)}`);
    } finally {
      setUploading(false);
      setUploadStatus('');
      event.target.value = '';
    }
  };

  const handleDownload = async (storagePath: string, fileName: string) => {
    try {
      const signedUrl = await getSignedDownloadUrl(storagePath);
      const link = document.createElement('a');
      link.href = signedUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError('Failed to generate download link.');
    }
  };

  // Helper to highlight search terms in results
  const highlightText = (text: string, query: string) => {
    if (!query) return text.substring(0, 150) + '...';
    
    // Find the index of the query (case-insensitive)
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text.substring(0, 150) + '...';
    
    // Extract a snippet around the match
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + query.length + 40);
    const snippet = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    
    return snippet;
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-indigo-600" />
          <h1 className="text-xl font-semibold text-slate-900">Central Collaboration Hub</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">{user?.email}</span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </header>
      
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Documents & Search */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Search Section */}
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Document Search</h2>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <Search className="h-5 w-5 text-slate-400" aria-hidden="true" />
                  </div>
                  <input
                    type="text"
                    className="block w-full rounded-lg border-0 py-3 pl-10 pr-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                    placeholder="Search inside documents (type at least 3 characters)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searching && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    </div>
                  )}
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="mt-6 space-y-4">
                    <h3 className="text-sm font-medium text-slate-500">Search Results</h3>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                      {searchResults.map((result) => (
                        <li key={result.id} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-indigo-500" />
                              <span className="font-medium text-slate-900">{result.files.name}</span>
                            </div>
                            <button
                              onClick={() => handleDownload(result.files.storage_path, result.files.name)}
                              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Download
                            </button>
                          </div>
                          <p className="text-sm text-slate-600 italic bg-slate-100 p-2 rounded border border-slate-200">
                            "{highlightText(result.content, searchQuery)}"
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {searchQuery.length >= 3 && !searching && searchResults.length === 0 && (
                  <p className="mt-4 text-sm text-slate-500 text-center py-4">No documents found matching "{searchQuery}"</p>
                )}
              </div>

              {/* Upload Section */}
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Upload Documents</h2>
                
                {error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-center w-full">
                  <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-40 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      {uploading ? (
                        <>
                          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                          <p className="mb-2 text-sm font-semibold text-slate-700">{uploadStatus}</p>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-8 h-8 text-slate-400 mb-3" />
                          <p className="mb-2 text-sm text-slate-500">
                            <span className="font-semibold">Click to upload</span> or drag and drop
                          </p>
                          <p className="text-xs text-slate-500">PDF, TXT, MD, CSV</p>
                        </>
                      )}
                    </div>
                    <input 
                      id="dropzone-file" 
                      type="file" 
                      className="hidden" 
                      onChange={handleFileUpload}
                      disabled={uploading || !teamId}
                      accept=".pdf,.txt,.md,.csv"
                    />
                  </label>
                </div>
              </div>

              {/* File List Section */}
              <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Your Files</h3>
                
                {loadingFiles ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    No files uploaded yet.
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between py-3 hover:bg-slate-50 px-2 rounded-lg transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <FileIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900">{file.name}</p>
                            <p className="text-xs text-slate-500">
                              {(file.size_bytes / 1024 / 1024).toFixed(2)} MB • {new Date(file.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDownload(file.storage_path, file.name)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                          title="Download with Pre-Signed URL"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Real-time Collaboration */}
            <div className="lg:col-span-1">
              {teamId ? (
                <CollaborationPanel teamId={teamId} />
              ) : (
                <div className="flex h-[600px] items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                </div>
              )}
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
