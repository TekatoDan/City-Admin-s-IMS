import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, Lock, AlertTriangle, Mail } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getDefaultTeam, getTeamRole } from '../lib/teams';

export default function ProtectedRoute() {
  const { session, loading } = useAuth();
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);

  useEffect(() => {
    async function checkApproval() {
      if (session?.user?.email) {
        const email = session.user.email;
        const userId = session.user.id;
        
        try {
          // Check if user is an owner
          const team = await getDefaultTeam(userId);
          const role = await getTeamRole(team.id, userId);
          
          const approvalsStr = localStorage.getItem('collabhub_user_approvals');
          let approvals = approvalsStr ? JSON.parse(approvalsStr) : {};

          if (role === 'owner') {
            // Auto-approve owners
            if (!approvals[email] || approvals[email].status !== 'approved') {
              approvals[email] = {
                status: 'approved',
                method: session.user.app_metadata?.provider === 'google' ? 'google' : 'email',
                timestamp: Date.now(),
                name: session.user.user_metadata?.full_name || email.split('@')[0],
                email: email
              };
              localStorage.setItem('collabhub_user_approvals', JSON.stringify(approvals));
            }
            setApprovalStatus('approved');
            return;
          }

          if (!approvals[email]) {
            // New user or first time on this browser
            approvals[email] = {
              status: 'pending',
              method: session.user.app_metadata?.provider === 'google' ? 'google' : 'email',
              timestamp: Date.now(),
              name: session.user.user_metadata?.full_name || email.split('@')[0],
              email: email
            };
            localStorage.setItem('collabhub_user_approvals', JSON.stringify(approvals));
          }

          setApprovalStatus(approvals[email].status);
        } catch (error) {
          console.error("Error checking role:", error);
          // Fallback to local storage logic if DB fails
          const approvalsStr = localStorage.getItem('collabhub_user_approvals');
          let approvals = approvalsStr ? JSON.parse(approvalsStr) : {};
          if (!approvals[email]) {
            approvals[email] = {
              status: 'pending',
              method: session.user.app_metadata?.provider === 'google' ? 'google' : 'email',
              timestamp: Date.now(),
              name: session.user.user_metadata?.full_name || email.split('@')[0],
              email: email
            };
            localStorage.setItem('collabhub_user_approvals', JSON.stringify(approvals));
          }
          setApprovalStatus(approvals[email].status);
        }
      }
    }

    checkApproval();
  }, [session]);

  if (loading || (session && !approvalStatus)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (approvalStatus === 'pending') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md space-y-8 rounded-2xl bg-white dark:bg-slate-900 p-10 shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
            <Lock className="h-10 w-10 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Account Pending
            </h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
              Oops! Your account is pending verification. Please contact your Administrator for access.
            </p>
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-medium">
              {session.user.email}
            </div>
            <button
              onClick={() => alert('Request resent to administrator.')}
              className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
            >
              Resend Request
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-3 w-full rounded-lg bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (approvalStatus === 'rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
        <div className="w-full max-w-md space-y-8 rounded-2xl bg-white dark:bg-slate-900 p-10 shadow-xl ring-1 ring-slate-900/5 dark:ring-white/10 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertTriangle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Access Denied
            </h2>
            <p className="mt-2 text-base text-slate-600 dark:text-slate-400">
              Your account request has been rejected.
            </p>
            <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-medium">
              {session.user.email}
            </div>
            <a
              href="mailto:admin@collabhub.com"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-colors"
            >
              <Mail className="h-4 w-4" />
              Contact Admin
            </a>
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-3 w-full rounded-lg bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm ring-1 ring-inset ring-slate-300 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
