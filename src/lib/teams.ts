import { supabase } from './supabase';

export async function getDefaultTeam(userId: string) {
  // Check if the user already has a team
  let { data: team, error: fetchError } = await supabase
    .from('teams')
    .select('*')
    .eq('created_by', userId)
    .limit(1)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
    throw fetchError;
  }

  // If no team exists, create a default "Personal Workspace"
  if (!team) {
    const { data: newTeam, error: insertError } = await supabase
      .from('teams')
      .insert({ 
        name: 'Personal Workspace', 
        description: 'Your default personal workspace',
        created_by: userId 
      })
      .select()
      .single();

    if (insertError) throw insertError;
    team = newTeam;

    // Add the user as the owner of the team
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ 
        team_id: team.id, 
        user_id: userId, 
        role: 'owner' 
      });

    if (memberError) throw memberError;
  }

  return team;
}
