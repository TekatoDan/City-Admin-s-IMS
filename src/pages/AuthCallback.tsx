import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let finished = false;

    const finishAuth = (session: any) => {
      if (finished) return;
      finished = true;
      
      if (window.opener) {
        // Notify the parent window and pass the tokens
        // This is required because the popup and iframe have partitioned storage
        window.opener.postMessage({ 
          type: 'OAUTH_AUTH_SUCCESS',
          session: session ? {
            access_token: session.access_token,
            refresh_token: session.refresh_token
          } : null
        }, '*');
        
        // Add a small delay before closing
        setTimeout(() => window.close(), 500);
      } else {
        navigate('/');
      }
    };

    // 1. Listen for the auth state change. Supabase automatically parses the URL hash 
    // and triggers this event when the session is ready.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && mounted) {
        finishAuth(session);
      }
    });

    // 2. Also check getSession directly in case the event already fired before we subscribed
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        if (mounted) setError(error.message);
        return;
      }
      if (data.session && mounted) {
        finishAuth(data.session);
      }
    }).catch((err) => {
      if (mounted) setError(err.message || "Failed to get session");
    });

    // 3. Timeout fallback just in case something goes wrong
    const timeoutId = setTimeout(() => {
      if (mounted && !finished) setError("Authentication timed out. Please try again.");
    }, 10000);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(timeoutId);
    };
  }, [navigate]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-slate-50 dark:bg-slate-950">
      {error ? (
        <div className="text-center space-y-4">
          <p className="text-red-600 dark:text-red-400 font-medium text-lg">Authentication Error</p>
          <p className="text-slate-600 dark:text-slate-400">{error}</p>
          <button 
            onClick={() => window.close()} 
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium hover:underline"
          >
            Close Window
          </button>
        </div>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-indigo-400 mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-medium">Completing authentication...</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">This window should close automatically.</p>
        </>
      )}
    </div>
  );
}
