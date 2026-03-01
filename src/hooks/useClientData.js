import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabaseClient';

export function useClientData(clientSlug) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const saveTimer = useRef(null);
  const dataRef = useRef(null);
  const skipNextReload = useRef(false);

  const loadClient = useCallback(async (fromRealtime = false) => {
    try {
      if (fromRealtime) {
        if (skipNextReload.current) {
          skipNextReload.current = false;
          return;
        }
      } else {
        setLoading(true);
      }

      const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('slug', clientSlug)
        .single();

      if (clientErr) throw clientErr;

      const [goalsRes, strengthsRes, strategiesRes, sessionsRes] = await Promise.all([
        supabase.from('goals').select('*').eq('client_id', client.id).order('sort_order'),
        supabase.from('strengths').select('*').eq('client_id', client.id).order('sort_order'),
        supabase.from('strategies').select('*').eq('client_id', client.id).order('sort_order'),
        supabase.from('sessions').select('*').eq('client_id', client.id).order('sort_order', { ascending: false }),
      ]);

      const goalIds = (goalsRes.data || []).map(g => g.id);
      let actionsData = [];
      if (goalIds.length > 0) {
        const { data: actions } = await supabase
          .from('actions')
          .select('*')
          .in('goal_id', goalIds)
          .order('sort_order');
        actionsData = actions || [];
      }

      const goals = (goalsRes.data || []).map(goal => ({
        ...goal,
        actions: actionsData.filter(a => a.goal_id === goal.id).map(a => ({
          id: a.id,
          text: a.text || '',
          done: a.done || false,
          dueDate: a.due_date || '',
          status: a.status || 'todo',
        })),
      }));

      const assembled = {
        clientId: client.id,
        clientName: client.client_name || '',
        clientInitial: client.client_initial || '',
        avatarColor: client.avatar_color || '#D4A373',
        showColorPicker: false,
        startDate: client.start_date || '',
        northStar: client.north_star || '',
        goals,
        strengths: (strengthsRes.data || []).map(s => ({ id: s.id, text: s.text || '' })),
        strategies: (strategiesRes.data || []).map(s => ({ id: s.id, text: s.text || '' })),
        sessions: (sessionsRes.data || []).map(s => ({
          id: s.id,
          date: s.date || '',
          title: s.title || '',
          takeaways: s.takeaways || '',
          nextSteps: s.next_steps || '',
        })),
      };

      // Only update state if data actually changed (prevents flash on realtime echo)
      if (JSON.stringify(assembled) !== JSON.stringify(dataRef.current)) {
        setData(assembled);
        dataRef.current = assembled;
      }
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [clientSlug]);

  useEffect(() => {
    loadClient();

    const realtimeLoad = () => loadClient(true);
    const channel = supabase
      .channel(`client-${clientSlug}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, realtimeLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, realtimeLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'actions' }, realtimeLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'strengths' }, realtimeLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'strategies' }, realtimeLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, realtimeLoad)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadClient, clientSlug]);

  const updateData = useCallback((newData) => {
    setData(newData);
    dataRef.current = newData;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveAll(newData), 1500);
  }, []);

  const saveAll = async (currentData) => {
    if (!currentData || !currentData.clientId) return;

    skipNextReload.current = true;
    try {
      await supabase.from('clients').update({
        client_name: currentData.clientName,
        client_initial: currentData.clientInitial,
        avatar_color: currentData.avatarColor,
        start_date: currentData.startDate,
        north_star: currentData.northStar,
      }).eq('id', currentData.clientId);

      const existingGoalIds = currentData.goals
        .filter(g => typeof g.id === 'string' && g.id.includes('-'))
        .map(g => g.id);

      if (existingGoalIds.length > 0) {
        await supabase.from('goals').delete()
          .eq('client_id', currentData.clientId)
          .not('id', 'in', `(${existingGoalIds.join(',')})`);
      } else {
        await supabase.from('goals').delete().eq('client_id', currentData.clientId);
      }

      for (let i = 0; i < currentData.goals.length; i++) {
        const goal = currentData.goals[i];
        const isNew = typeof goal.id === 'number';
        let goalId;

        if (isNew) {
          const { data: inserted } = await supabase.from('goals').insert({
            client_id: currentData.clientId,
            title: goal.title || '',
            why: goal.why || '',
            challenges: goal.challenges || '',
            notes: goal.notes || '',
            sort_order: i,
          }).select('id').single();
          goalId = inserted.id;
          goal.id = goalId;
        } else {
          goalId = goal.id;
          await supabase.from('goals').update({
            title: goal.title || '',
            why: goal.why || '',
            challenges: goal.challenges || '',
            notes: goal.notes || '',
            sort_order: i,
          }).eq('id', goalId);
        }

        await supabase.from('actions').delete().eq('goal_id', goalId);
        if (goal.actions.length > 0) {
          await supabase.from('actions').insert(
            goal.actions.map((a, j) => ({
              goal_id: goalId,
              text: a.text || '',
              done: a.done || false,
              due_date: a.dueDate || '',
              status: a.status || 'todo',
              sort_order: j,
            }))
          );
        }
      }

      await supabase.from('strengths').delete().eq('client_id', currentData.clientId);
      if (currentData.strengths.length > 0) {
        await supabase.from('strengths').insert(
          currentData.strengths.map((s, i) => ({
            client_id: currentData.clientId,
            text: s.text || '',
            sort_order: i,
          }))
        );
      }

      await supabase.from('strategies').delete().eq('client_id', currentData.clientId);
      if (currentData.strategies.length > 0) {
        await supabase.from('strategies').insert(
          currentData.strategies.map((s, i) => ({
            client_id: currentData.clientId,
            text: s.text || '',
            sort_order: i,
          }))
        );
      }

      await supabase.from('sessions').delete().eq('client_id', currentData.clientId);
      if (currentData.sessions.length > 0) {
        await supabase.from('sessions').insert(
          currentData.sessions.map((s, i) => ({
            client_id: currentData.clientId,
            date: s.date || '',
            title: s.title || '',
            takeaways: s.takeaways || '',
            next_steps: s.nextSteps || '',
            sort_order: i,
          }))
        );
      }
    } catch (err) {
      skipNextReload.current = false;
      console.error('Save error:', err);
    }
  };

  return { data, loading, error, updateData };
}
