import React, { useState, useEffect } from 'react';
import { Loader2, UserCheck, UserX, Shield, Users, AlertTriangle } from 'lucide-react';
import { getTeamMembers, updateTeamMemberRole, removeTeamMember } from '../lib/teams';

interface AdminPanelProps {
  teamId: string;
  currentUserRole: string | null;
  currentUserId: string | undefined;
}

export function AdminPanel({ teamId, currentUserRole, currentUserId }: AdminPanelProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await getTeamMembers(teamId);
      setMembers(data);
    } catch (err: any) {
      setError(`Failed to load members: ${err.message || JSON.stringify(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [teamId]);

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    setProcessingId(memberId);
    try {
      await updateTeamMemberRole(memberId, newRole);
      
      // Update local storage approval status if activating
      if (newRole !== 'viewer') {
        const member = members.find(m => m.id === memberId);
        if (member?.users?.email) {
          const email = member.users.email;
          const approvalsStr = localStorage.getItem('collabhub_user_approvals');
          if (approvalsStr) {
            const approvals = JSON.parse(approvalsStr);
            if (approvals[email]) {
              approvals[email].status = 'approved';
              localStorage.setItem('collabhub_user_approvals', JSON.stringify(approvals));
            }
          }
        }
      }
      
      await loadMembers();
    } catch (err: any) {
      setError(`Failed to update role: ${err.message || JSON.stringify(err)}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm('Are you sure you want to remove this user from the team?')) return;
    setProcessingId(memberId);
    try {
      const member = members.find(m => m.id === memberId);
      await removeTeamMember(memberId);
      
      // Update local storage approval status to rejected
      if (member?.users?.email) {
        const email = member.users.email;
        const approvalsStr = localStorage.getItem('collabhub_user_approvals');
        if (approvalsStr) {
          const approvals = JSON.parse(approvalsStr);
          if (approvals[email]) {
            approvals[email].status = 'rejected';
            localStorage.setItem('collabhub_user_approvals', JSON.stringify(approvals));
          }
        }
      }
      
      await loadMembers();
    } catch (err: any) {
      setError(`Failed to remove user: ${err.message || JSON.stringify(err)}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  const pendingMembers = members.filter(m => m.role === 'viewer');
  const activeMembers = members.filter(m => m.role !== 'viewer');

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          Team Management
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-2">
          Manage user access, verify new users, and assign roles.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-400">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="space-y-8">
        {/* Verify New Users */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/10">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-600 dark:text-amber-500" />
              Verify New Users ({pendingMembers.length})
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              These users have signed in but cannot access files until verified.
            </p>
          </div>
          
          {pendingMembers.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400 italic">
              No new users to verify.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {pendingMembers.map(member => (
                <div key={member.id} className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold">
                      {member.users?.email?.substring(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">
                        {member.users?.full_name || member.users?.email?.split('@')[0] || 'Unknown User'}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{member.users?.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleUpdateRole(member.id, 'member')}
                      disabled={processingId === member.id}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {processingId === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                      Verify as Member
                    </button>
                    <button
                      onClick={() => handleRemoveMember(member.id)}
                      disabled={processingId === member.id}
                      className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors disabled:opacity-50"
                    >
                      {processingId === member.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Members */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Active Members ({activeMembers.length})
            </h3>
          </div>
          
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {activeMembers.map(member => (
              <div key={member.id} className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-700 dark:text-indigo-400 font-bold">
                    {member.users?.email?.substring(0, 2).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      {member.users?.full_name || member.users?.email?.split('@')[0] || 'Unknown User'}
                      {member.user_id === currentUserId && (
                        <span className="text-xs bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">You</span>
                      )}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{member.users?.email}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <select
                    value={member.role}
                    onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                    disabled={processingId === member.id || (member.role === 'owner' && currentUserRole !== 'owner') || member.user_id === currentUserId}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    {currentUserRole === 'owner' && <option value="owner">Owner</option>}
                  </select>
                  
                  <button
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={processingId === member.id || (member.role === 'owner' && currentUserRole !== 'owner') || member.user_id === currentUserId}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                    title="Remove User"
                  >
                    <UserX className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
