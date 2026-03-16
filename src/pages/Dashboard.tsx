import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogOut, UploadCloud, Download, Loader2, 
  Search, FileText, Trash2, Edit2, Check, X,
  HardDrive, Plus, Folder, Users, Clock, Star, Settings, Filter,
  Image as ImageIcon, FileCode, MoreVertical, FolderPlus, ChevronRight
} from 'lucide-react';
import { getDefaultTeam } from '../lib/teams';
import { 
  uploadDocument, getTeamFiles, getSignedDownloadUrl, UploadedFileRecord, 
  saveDocumentContent, searchDocuments, SearchResult, deleteDocument, 
  updateDocumentName, getFolders, createFolder, deleteFolder, FolderRecord 
} from '../lib/storage';
import { extractTextFromFile } from '../lib/parser';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const [teamId, setTeamId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [showUploadPanel, setShowUploadPanel] = useState(true);

  // Folder creation state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<FolderRecord | null>(null);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Rename and Delete state
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<UploadedFileRecord | null>(null);

  // Preview state
  const [previewFile, setPreviewFile] = useState<UploadedFileRecord | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  
  // PDF Preview state
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  useEffect(() => {
    if (!user) return;
    
    const initialize = async () => {
      try {
        const team = await getDefaultTeam(user.id);
        setTeamId(team.id);
        await loadDirectory(team.id, null);
      } catch (err: any) {
        setError(`Failed to load workspace data: ${err.message || JSON.stringify(err)}`);
        console.error(err);
      } finally {
        setLoadingFiles(false);
      }
    };

    initialize();
  }, [user]);

  const loadDirectory = async (tId: string, fId: string | null) => {
    setLoadingFiles(true);
    try {
      const [fetchedFolders, fetchedFiles] = await Promise.all([
        getFolders(tId, fId),
        getTeamFiles(tId, fId)
      ]);
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
    } catch (err: any) {
      setError(`Failed to load directory: ${err.message || JSON.stringify(err)}`);
    } finally {
      setLoadingFiles(false);
    }
  };

  const navigateToFolder = (folder: FolderRecord) => {
    if (!teamId) return;
    setCurrentFolderId(folder.id);
    setFolderPath(prev => [...prev, { id: folder.id, name: folder.name }]);
    loadDirectory(teamId, folder.id);
  };

  const navigateUp = (index: number) => {
    if (!teamId) return;
    if (index === -1) {
      // Go to root
      setCurrentFolderId(null);
      setFolderPath([]);
      loadDirectory(teamId, null);
    } else {
      // Go to specific folder in path
      const targetFolder = folderPath[index];
      setCurrentFolderId(targetFolder.id);
      setFolderPath(prev => prev.slice(0, index + 1));
      loadDirectory(teamId, targetFolder.id);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !teamId) return;
    setCreatingFolder(true);
    try {
      const newFolder = await createFolder(teamId, newFolderName, currentFolderId);
      setFolders(prev => [...prev, newFolder].sort((a, b) => a.name.localeCompare(b.name)));
      setShowNewFolderModal(false);
      setNewFolderName('');
    } catch (err: any) {
      setError(`Failed to create folder: ${err.message || JSON.stringify(err)}`);
    } finally {
      setCreatingFolder(false);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeletingFolderId(folderToDelete.id);
    try {
      await deleteFolder(folderToDelete.id);
      setFolders((prev) => prev.filter((f) => f.id !== folderToDelete.id));
      setFolderToDelete(null);
    } catch (err: any) {
      setError(`Failed to delete folder: ${err.message || JSON.stringify(err)}`);
    } finally {
      setDeletingFolderId(null);
    }
  };

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
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, teamId]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !teamId) return;

    setUploading(true);
    setError(null);
    setUploadStatus('Uploading file to secure storage...');

    try {
      const newFileRecord = await uploadDocument(file, teamId, currentFolderId);
      setFiles((prev) => [newFileRecord, ...prev]);

      setUploadStatus('Parsing document contents for search index...');
      try {
        const extractedText = await extractTextFromFile(file);
        
        if (extractedText) {
          setUploadStatus('Saving to search index...');
          await saveDocumentContent(newFileRecord.id, extractedText);
        } else {
          setError('File uploaded, but no text could be extracted.');
        }
      } catch (parseError: any) {
        console.warn('Could not parse file text:', parseError);
        setError(`File uploaded, but text extraction failed: ${parseError.message}`);
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

  const handlePreview = async (file: UploadedFileRecord) => {
    setPreviewFile(file);
    setPreviewLoading(true);
    setPreviewText(null);
    
    // Clean up previous object URL if exists
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    
    try {
      const signedUrl = await getSignedDownloadUrl(file.storage_path);
      const isTextFile = file.mime_type?.startsWith('text/') || file.name.match(/\.(md|ts|js|json|html|css|csv|txt)$/i);
      
      if (isTextFile) {
        try {
          const response = await fetch(signedUrl);
          if (!response.ok) throw new Error('Network response was not ok');
          const text = await response.text();
          setPreviewText(text);
          setPreviewUrl(signedUrl);
        } catch (fetchErr) {
          console.warn("Failed to fetch text", fetchErr);
          setPreviewUrl(signedUrl); // Fallback
        }
      } else if (file.mime_type === 'application/pdf') {
        // For react-pdf, we can just pass the signed URL directly.
        // It handles fetching and rendering.
        setPreviewUrl(signedUrl);
      } else {
        setPreviewUrl(signedUrl);
      }
    } catch (err: any) {
      setError(`Failed to load preview: ${err.message || JSON.stringify(err)}`);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    setDeletingId(fileToDelete.id);
    try {
      await deleteDocument(fileToDelete.id, fileToDelete.storage_path);
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err: any) {
      setError(`Failed to delete file: ${err.message || JSON.stringify(err)}`);
    } finally {
      setDeletingId(null);
    }
  };

  const startRename = (file: UploadedFileRecord) => {
    setEditingFileId(file.id);
    setEditName(file.name);
  };

  const handleRename = async (fileId: string) => {
    if (!editName.trim()) {
      setEditingFileId(null);
      return;
    }
    setRenamingId(fileId);
    try {
      await updateDocumentName(fileId, editName);
      setFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, name: editName } : f))
      );
      setEditingFileId(null);
    } catch (err: any) {
      setError(`Failed to rename file: ${err.message || JSON.stringify(err)}`);
    } finally {
      setRenamingId(null);
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text.substring(0, 150) + '...';
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text.substring(0, 150) + '...';
    
    const start = Math.max(0, index - 40);
    const end = Math.min(text.length, index + query.length + 40);
    const snippet = (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    
    return snippet;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} mins ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 172800) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex h-screen bg-white text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-200 flex flex-col justify-between flex-shrink-0 bg-white">
        <div>
          <div className="h-16 flex items-center px-6 gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">CollabHub</span>
          </div>
          <div className="px-4 mt-4 flex gap-2">
            <button 
              onClick={() => setShowUploadPanel(true)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2.5 flex items-center justify-center gap-2 font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              New
            </button>
            <button 
              onClick={() => setShowNewFolderModal(true)}
              className="px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center transition-colors"
              title="New Folder"
            >
              <FolderPlus className="w-5 h-5" />
            </button>
          </div>
          <nav className="mt-6 px-3 space-y-1">
            <a href="#" className="flex items-center gap-3 px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium">
              <Folder className="w-5 h-5" /> My Files
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
              <Users className="w-5 h-5" /> Shared with me
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
              <Clock className="w-5 h-5" /> Recent
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
              <Star className="w-5 h-5" /> Starred
            </a>
          </nav>
          
          <div className="mt-8 px-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Folders</h3>
            <nav className="space-y-1 -mx-3">
              {folders.map(folder => (
                <div key={folder.id} className="flex items-center justify-between px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg group">
                  <a href="#" onClick={(e) => { e.preventDefault(); navigateToFolder(folder); }} className="flex items-center gap-3 font-medium flex-1">
                    <Folder className="w-5 h-5" /> {folder.name}
                  </a>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setFolderToDelete(folder); }}
                    className="p-1 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Folder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {folders.length === 0 && (
                <div className="px-3 py-2 text-sm text-slate-400 italic">No folders yet</div>
              )}
            </nav>
          </div>
          
          <div className="mt-8 px-6">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Teams</h3>
            <nav className="space-y-1 -mx-3">
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
                <Users className="w-5 h-5" /> Design Team
              </a>
              <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
                <Users className="w-5 h-5" /> Engineering
              </a>
            </nav>
          </div>
        </div>
        
        <div className="p-3">
          <nav className="space-y-1 mb-4">
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
              <Trash2 className="w-5 h-5" /> Trash
            </a>
            <a href="#" className="flex items-center gap-3 px-3 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
              <Settings className="w-5 h-5" /> Settings
            </a>
          </nav>
          <div className="border-t border-slate-200 pt-4 px-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm">
              {user?.email?.substring(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{user?.email?.split('@')[0] || 'User'}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <button onClick={signOut} className="text-slate-400 hover:text-slate-600">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header */}
        <header className="h-16 border-b border-slate-200 flex items-center justify-between px-8 flex-shrink-0">
          <h1 className="text-xl font-semibold text-slate-900">My Files</h1>
          <div className="flex items-center gap-4">
            <div className="relative w-96">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search files..." 
                className="w-full bg-slate-50 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                </div>
              )}
            </div>
            <button className="p-2 text-slate-400 hover:bg-slate-50 rounded-lg">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <div className="text-sm text-slate-500 mb-6 flex items-center gap-2">
            <span className="hover:text-slate-700 cursor-pointer" onClick={() => navigateUp(-1)}>CollabHub</span>
            <span>/</span>
            <span 
              className={`cursor-pointer hover:text-slate-700 ${folderPath.length === 0 ? 'text-slate-900 font-medium' : ''}`}
              onClick={() => navigateUp(-1)}
            >
              My Files
            </span>
            {folderPath.map((folder, index) => (
              <span key={folder.id} className="flex items-center gap-2">
                <span>/</span>
                <span 
                  className={`cursor-pointer hover:text-slate-700 ${index === folderPath.length - 1 ? 'text-slate-900 font-medium' : ''}`}
                  onClick={() => navigateUp(index)}
                >
                  {folder.name}
                </span>
              </span>
            ))}
          </div>

          {/* Search Results or File List */}
          {searchQuery.length >= 3 ? (
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Search Results</h3>
              {searching ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-4">
                  {searchResults.map((result) => (
                    <div key={result.id} className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-indigo-500" />
                          <span className="font-medium text-slate-900">{result.files.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <button onClick={() => handlePreview(result.files)} className="text-sm text-indigo-600 font-medium hover:underline">Preview</button>
                          <button onClick={() => handleDownload(result.files.storage_path, result.files.name)} className="text-sm text-slate-500 font-medium hover:text-slate-700 hover:underline">Download</button>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100 italic">
                        "...{highlightText(result.content, searchQuery)}..."
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No documents found matching "{searchQuery}"</p>
              )}
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="pb-3 font-semibold">Name <span className="inline-block ml-1">↑</span></th>
                  <th className="pb-3 font-semibold">Owner</th>
                  <th className="pb-3 font-semibold">Last Modified</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {/* Folders */}
                {folders.map(folder => (
                  <tr key={folder.id} className="border-b border-slate-100 hover:bg-slate-50 group cursor-pointer" onClick={() => navigateToFolder(folder)}>
                    <td className="py-4 flex items-center gap-3">
                      <Folder className="w-5 h-5 text-indigo-500 fill-indigo-50" />
                      <span className="font-medium text-slate-900">{folder.name}</span>
                    </td>
                    <td className="py-4 text-slate-500">Me</td>
                    <td className="py-4 text-slate-500">{formatTimeAgo(folder.created_at)}</td>
                    <td className="py-4 text-slate-500">--</td>
                    <td className="py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setFolderToDelete(folder)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete Folder">
                          {deletingFolderId === folder.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {/* Actual files */}
                {loadingFiles ? (
                  <tr><td colSpan={5} className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 mx-auto" /></td></tr>
                ) : files.length === 0 && folders.length === 0 ? (
                  <tr><td colSpan={5} className="py-8 text-center text-slate-500">No files uploaded yet.</td></tr>
                ) : (
                  files.map(file => {
                    const isPdf = file.name.toLowerCase().endsWith('.pdf');
                    const isImg = file.name.toLowerCase().match(/\.(jpg|jpeg|png|gif|svg)$/);
                    const isCode = file.name.toLowerCase().match(/\.(md|ts|js|json|html|css)$/);
                    
                    let FileIconComponent = FileText;
                    let iconColor = "text-slate-500";
                    
                    if (isPdf) {
                      FileIconComponent = FileText;
                      iconColor = "text-red-500";
                    } else if (isImg) {
                      FileIconComponent = ImageIcon;
                      iconColor = "text-emerald-500";
                    } else if (isCode) {
                      FileIconComponent = FileCode;
                      iconColor = "text-blue-500";
                    }

                    return (
                      <tr key={file.id} onClick={() => handlePreview(file)} className="border-b border-slate-100 hover:bg-slate-50 group cursor-pointer">
                        <td className="py-4 flex items-center gap-3">
                          <FileIconComponent className={`w-5 h-5 ${iconColor}`} />
                          {editingFileId === file.id ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                disabled={renamingId === file.id}
                                className="block w-full rounded-md border-0 py-1 px-2 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm disabled:opacity-50"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleRename(file.id);
                                  if (e.key === 'Escape') setEditingFileId(null);
                                }}
                              />
                              <button onClick={() => handleRename(file.id)} disabled={renamingId === file.id} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50">
                                {renamingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button onClick={() => setEditingFileId(null)} disabled={renamingId === file.id} className="p-1 text-slate-400 hover:bg-slate-100 rounded disabled:opacity-50">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <span className="font-medium text-slate-900 truncate max-w-[250px]">{file.name}</span>
                          )}
                        </td>
                        <td className="py-4 text-slate-500">Me</td>
                        <td className="py-4 text-slate-500">{formatTimeAgo(file.created_at)}</td>
                        <td className="py-4 text-slate-500">{(file.size_bytes / 1024 / 1024).toFixed(1)} MB</td>
                        <td className="py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <button onClick={() => startRename(file)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Rename"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDownload(file.storage_path, file.name)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Download"><Download className="w-4 h-4" /></button>
                            <button onClick={() => setFileToDelete(file)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                              {deletingId === file.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Right Sidebar - Upload Panel */}
      {showUploadPanel && (
        <aside className="w-80 border-l border-slate-200 bg-white flex flex-col flex-shrink-0">
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6">
            <h2 className="font-semibold text-slate-900">Upload</h2>
            <button onClick={() => setShowUploadPanel(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 flex-1">
            {error && (
              <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            
            <label htmlFor="file-upload" className="block w-full h-96 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative group">
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                {uploading ? (
                  <>
                    <Loader2 className="w-12 h-12 text-indigo-500 animate-spin mb-4" />
                    <p className="text-sm font-medium text-slate-900 mb-1">Uploading...</p>
                    <p className="text-xs text-slate-500">{uploadStatus}</p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                      <UploadCloud className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mb-2">Drag & Drop files here</h3>
                    <p className="text-sm text-slate-500 mb-6">or click to browse from your computer</p>
                    <div className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 shadow-sm mb-6">
                      Browse Files
                    </div>
                    <p className="text-xs text-slate-400">Supports PDF, PNG, JPG, MD, TS up to 50MB</p>
                  </>
                )}
              </div>
              <input 
                id="file-upload" 
                type="file" 
                className="hidden" 
                onChange={handleFileUpload}
                disabled={uploading || !teamId}
                accept=".pdf,.txt,.md,.csv,.png,.jpg,.jpeg"
              />
            </label>
          </div>
        </aside>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="block w-full rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm mb-6"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowNewFolderModal(false);
              }}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setShowNewFolderModal(false)}
                disabled={creatingFolder}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreateFolder}
                disabled={creatingFolder || !newFolderName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {creatingFolder && <Loader2 className="w-4 h-4 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Folder Confirmation Modal */}
      {folderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete Folder</h3>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to delete <span className="font-semibold text-slate-700">"{folderToDelete.name}"</span> and all its contents? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setFolderToDelete(null)}
                disabled={deletingFolderId === folderToDelete.id}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteFolder}
                disabled={deletingFolderId === folderToDelete.id}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingFolderId === folderToDelete.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Delete File</h3>
            <p className="text-sm text-slate-500 mb-6">
              Are you sure you want to delete <span className="font-semibold text-slate-700">"{fileToDelete.name}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setFileToDelete(null)}
                disabled={deletingId === fileToDelete.id}
                className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                disabled={deletingId === fileToDelete.id}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {deletingId === fileToDelete.id && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-indigo-500" />
                <h3 className="text-lg font-semibold text-slate-900">{previewFile.name}</h3>
              </div>
              <button 
                onClick={() => { 
                  setPreviewFile(null); 
                  if (previewUrl && previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(previewUrl);
                  }
                  setPreviewUrl(null); 
                }}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 overflow-hidden relative flex items-center justify-center">
              {previewLoading ? (
                <div className="flex flex-col items-center text-slate-500">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p>Loading preview...</p>
                </div>
              ) : previewText !== null ? (
                <div className="w-full h-full p-8 overflow-auto bg-white text-left">
                  <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800">{previewText}</pre>
                </div>
              ) : previewUrl ? (
                previewFile.mime_type?.startsWith('image/') ? (
                  <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
                ) : previewFile.mime_type === 'application/pdf' ? (
                  <div className="w-full h-full overflow-auto bg-slate-200 flex flex-col items-center py-8">
                    <Document
                      file={previewUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading={
                        <div className="flex flex-col items-center text-slate-500 my-12">
                          <Loader2 className="w-8 h-8 animate-spin mb-4" />
                          <p>Loading PDF...</p>
                        </div>
                      }
                      error={
                        <div className="text-red-500 my-12 bg-white p-4 rounded-lg shadow">
                          Failed to load PDF. Please try downloading it instead.
                        </div>
                      }
                      className="flex flex-col items-center"
                    >
                      {Array.from(new Array(numPages || 0), (el, index) => (
                        <div key={`page_${index + 1}`} className="mb-6 shadow-lg bg-white">
                          <Page 
                            pageNumber={index + 1} 
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            width={Math.min(window.innerWidth * 0.8, 800)}
                          />
                        </div>
                      ))}
                    </Document>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-slate-500 p-8 text-center">
                    <FileText className="w-16 h-16 mb-4 text-slate-300" />
                    <p className="text-lg font-medium text-slate-900 mb-2">No preview available</p>
                    <p className="mb-6">This file type ({previewFile.mime_type || 'unknown'}) cannot be previewed directly in the browser.</p>
                    <button 
                      onClick={() => handleDownload(previewFile.storage_path, previewFile.name)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download File
                    </button>
                  </div>
                )
              ) : (
                <div className="text-red-500">Failed to load preview URL.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
