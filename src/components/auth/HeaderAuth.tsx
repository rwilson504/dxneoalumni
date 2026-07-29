import { isSupabaseConfigured } from '~/lib/supabase';
import { useSession } from './useSession';

/** Small header affordance: link to the member area, or to sign in. */
export default function HeaderAuth({ base }: { base: string }) {
  const { loading, session, member } = useSession();

  if (!isSupabaseConfigured || loading) return null;

  return (
    <a className="header-auth" href={`${base}/members`}>
      {session && member ? member.full_name.split(' ')[0] : 'Member sign in'}
    </a>
  );
}
