import { supabase } from './supabase';

export async function getTeamRole(teamId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Error fetching team role:', error);
    return null;
  }

  return data?.role || null;
}

export async function getTeamMembers(teamId: string) {
  const { data, error } = await supabase
    .from('team_members')
    .select(`
      id,
      role,
      user_id,
      users (
        id,
        email,
        full_name,
        avatar_url
      )
    `)
    .eq('team_id', teamId);

  if (error) {
    console.error('Error fetching team members:', error);
    return [];
  }

  return data;
}

export async function addTeamMember(teamId: string, email: string, role: string) {
  // First, find the user by email (in a real app, this would be a secure backend call)
  // For this demo, we'll assume we can query a public users table or similar, 
  // but Supabase auth users aren't directly queryable from the client by email.
  // We'll simulate it or require the user to exist in a public profiles table.
  // Since we don't have a profiles table, we'll just throw an error explaining this limitation.
  throw new Error("Inviting users by email requires a backend function in Supabase. For this demo, users must be added manually in the database.");
}

export async function updateTeamMemberRole(memberId: string, newRole: string) {
  const { error } = await supabase
    .from('team_members')
    .update({ role: newRole })
    .eq('id', memberId);

  if (error) throw error;
}

export async function removeTeamMember(memberId: string) {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('id', memberId);

  if (error) throw error;
}

export async function getDefaultTeam(userId: string) {
  // Check if the user is already a member of any team
  let { data: memberData, error: memberFetchError } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (memberData) {
    // User is in a team, fetch the team details
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', memberData.team_id)
      .single();
      
    if (teamError) throw teamError;
    return team;
  }

  // User is not in any team. Let's find the main "Government Hub" team.
  // We'll just get the oldest team in the database as the primary one.
  let { data: primaryTeam, error: primaryTeamError } = await supabase
    .from('teams')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!primaryTeam) {
    // No teams exist at all. This user is the first user, make them the owner of the new primary team.
    const { data: newTeam, error: insertError } = await supabase
      .from('teams')
      .insert({ 
        name: 'Government Hub', 
        description: 'Central Government Files Repository',
        created_by: userId 
      })
      .select()
      .single();

    if (insertError) throw insertError;
    primaryTeam = newTeam;

    // Add the first user as the owner
    const { error: newMemberError } = await supabase
      .from('team_members')
      .insert({ 
        team_id: primaryTeam.id, 
        user_id: userId, 
        role: 'owner' 
      });

    if (newMemberError) throw newMemberError;
  } else {
    // The primary team exists, but this user is not a member. Add them as a "viewer" (pending activation).
    const { error: newMemberError } = await supabase
      .from('team_members')
      .insert({ 
        team_id: primaryTeam.id, 
        user_id: userId, 
        role: 'viewer' 
      });

    if (newMemberError) throw newMemberError;
  }

  return primaryTeam;
}
