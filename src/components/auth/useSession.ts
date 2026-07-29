import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured, type Member } from '~/lib/supabase';

export type SessionState = {
  loading: boolean;
  session: Session | null;
  member: Member | null;
  /** Signed in, but no member row matched the address — i.e. not on the roster. */
  notOnRoster: boolean;
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({
    loading: true,
    session: null,
    member: null,
    notOnRoster: false,
  });

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setState({ loading: false, session: null, member: null, notOnRoster: false });
      return;
    }

    const supabase = getSupabase();
    let active = true;

    async function load(session: Session | null) {
      if (!session) {
        if (active) setState({ loading: false, session: null, member: null, notOnRoster: false });
        return;
      }

      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (active) {
        setState({ loading: false, session, member: data ?? null, notOnRoster: !data });
      }
    }

    supabase.auth.getSession().then(({ data }) => load(data.session));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return state;
}
