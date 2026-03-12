import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage, getTeamMessages, sendMessage } from '../lib/chat';
import { Send, Users, Circle } from 'lucide-react';

interface CollaborationPanelProps {
  teamId: string;
}

export default function CollaborationPanel({ teamId }: CollaborationPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!user || !teamId) return;

    // Load initial messages
    getTeamMessages(teamId).then(setMessages).catch(console.error);

    // Initialize Supabase Channel for this specific team
    const channel = supabase.channel(`team_room:${teamId}`, {
      config: {
        presence: {
          key: user.id,
        },
      },
    });

    // 1. Listen for Presence changes (who is online)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      // Extract unique emails from the presence state
      const users = Object.values(state).flatMap((presences) => 
        presences.map((p: any) => p.email)
      );
      setOnlineUsers([...new Set(users)]);
    });

    // 2. Listen for new messages in the database
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `team_id=eq.${teamId}`,
      },
      (payload) => {
        const newMsg = payload.new as ChatMessage;
        setMessages((prev) => [...prev, newMsg]);
      }
    );

    // 3. Subscribe to the channel and track presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          email: user.email,
          online_at: new Date().toISOString(),
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teamId, user]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user || !user.email) return;

    const content = newMessage.trim();
    setNewMessage(''); // Optimistic clear

    try {
      await sendMessage(teamId, user.id, user.email, content);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  return (
    <div className="flex h-[600px] flex-col rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden sticky top-6">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Users className="h-5 w-5 text-indigo-600" />
          Team Chat & Presence
        </h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {onlineUsers.map((email) => (
            <span key={email} className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full ring-1 ring-inset ring-emerald-600/20">
              <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
              {email.split('@')[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-slate-500 mt-10">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[10px] text-slate-500 mb-1 px-1">
                  {isMe ? 'You' : msg.user_email.split('@')[0]} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${isMe ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white text-slate-900 ring-1 ring-inset ring-slate-200 rounded-tl-sm'}`}>
                  {msg.content}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-slate-200 bg-white p-3">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border-0 py-2 px-3 text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
