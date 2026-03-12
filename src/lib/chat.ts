import { supabase } from './supabase';

export interface ChatMessage {
  id: string;
  team_id: string;
  user_id: string;
  user_email: string;
  content: string;
  created_at: string;
}

export async function getTeamMessages(teamId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function sendMessage(teamId: string, userId: string, userEmail: string, content: string) {
  const { error } = await supabase
    .from('messages')
    .insert({
      team_id: teamId,
      user_id: userId,
      user_email: userEmail,
      content
    });

  if (error) throw error;
}
