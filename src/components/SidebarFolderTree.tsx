import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, Folder, Loader2 } from 'lucide-react';
import { getFolders, FolderRecord } from '../lib/storage';

interface SidebarFolderTreeProps {
  teamId: string;
  currentFolderId: string | null;
  onNavigate: (folder: FolderRecord) => void;
  parentId?: string | null;
  level?: number;
  refreshTrigger?: number;
  onDragOver?: (e: React.DragEvent, folderId: string) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, folderId: string) => void;
  dragOverFolderId?: string | null;
}

export function SidebarFolderTree({ teamId, currentFolderId, onNavigate, parentId = null, level = 0, refreshTrigger = 0, onDragOver, onDragLeave, onDrop, dragOverFolderId }: SidebarFolderTreeProps) {
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadFolders = async () => {
      setIsLoading(true);
      try {
        const fetchedFolders = await getFolders(teamId, parentId);
        if (isMounted) {
          setFolders(fetchedFolders);
          setHasLoaded(true);
        }
      } catch (error) {
        console.error('Failed to load folders:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadFolders();
    return () => { isMounted = false; };
  }, [teamId, parentId, refreshTrigger]);

  if (isLoading && !hasLoaded) {
    return (
      <div className="flex items-center gap-2 py-1 px-3 text-slate-400" style={{ paddingLeft: `${(level + 1) * 0.75 + 0.75}rem` }}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span className="text-xs">Loading...</span>
      </div>
    );
  }

  if (folders.length === 0 && level > 0) {
    return null; // Don't show "Empty" to keep it clean
  }

  return (
    <div className="space-y-0.5">
      {folders.map(folder => (
        <FolderItem 
          key={folder.id} 
          folder={folder} 
          teamId={teamId} 
          currentFolderId={currentFolderId} 
          onNavigate={onNavigate} 
          level={level} 
          refreshTrigger={refreshTrigger}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          dragOverFolderId={dragOverFolderId}
        />
      ))}
    </div>
  );
}

interface FolderItemProps {
  folder: FolderRecord;
  teamId: string;
  currentFolderId: string | null;
  onNavigate: (folder: FolderRecord) => void;
  level: number;
  refreshTrigger: number;
  onDragOver?: (e: React.DragEvent, folderId: string) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, folderId: string) => void;
  dragOverFolderId?: string | null;
}

const FolderItem: React.FC<FolderItemProps> = ({ folder, teamId, currentFolderId, onNavigate, level, refreshTrigger, onDragOver, onDragLeave, onDrop, dragOverFolderId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isSelected = currentFolderId === folder.id;
  const isDragOver = dragOverFolderId === folder.id;

  return (
    <div className="w-full">
      <div 
        className={`flex items-center group cursor-pointer rounded-lg py-1.5 pr-3 transition-colors ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'} ${isDragOver ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
        style={{ paddingLeft: `${level * 0.75 + 0.75}rem` }}
        onDragOver={(e) => onDragOver?.(e, folder.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop?.(e, folder.id)}
      >
        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 mr-1 flex-shrink-0"
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <div 
          className="flex items-center gap-2 flex-1 min-w-0"
          onClick={() => onNavigate(folder)}
        >
          <Folder className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'fill-indigo-100 dark:fill-indigo-900/50' : ''}`} />
          <span className="text-sm font-medium truncate">{folder.name}</span>
        </div>
      </div>
      
      {isExpanded && (
        <SidebarFolderTree 
          teamId={teamId} 
          currentFolderId={currentFolderId} 
          onNavigate={onNavigate} 
          parentId={folder.id} 
          level={level + 1} 
          refreshTrigger={refreshTrigger}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          dragOverFolderId={dragOverFolderId}
        />
      )}
    </div>
  );
}
