import { useState } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured, siteUrl } from '~/lib/supabase';
type Status = { kind: 'idle' | 'sending' | 'sent' | 'error'; message?: string };

function explain(error: AuthError): string {
  switch (error.code) {
    // The quota is project-wide, not per address, so don't imply this address was just used.
    case 'over_email_send_rate_limit':
      return 'Too many sign-in emails have gone out recently. Please wait a few minutes and try again.';
    case 'validation_failed':
      return 'That doesn’t look like a valid email address.';
    default:
      return error.message;
  }
}

export default function SignInPanel() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  if (!isSupabaseConfigured) {
    return (
      <div className="notice">
        <h2>Sign-in isn’t switched on yet</h2>
        <p>
          The member area needs its database connection configured before anyone can sign in.
          See the Phase 2 setup steps in the project README.
        </p>
      </div>
    );
  }

  async function sendLink() {
    setStatus({ kind: 'sending' });

    const { error } = await getSupabase().auth.signInWithOtp({
      email: email.trim(),
      // shouldCreateUser must stay at its default of true. Supabase Auth knows nothing
      // about the members table, so setting it false would reject every brother who has
      // not signed in before — there is no auth.users row to match until they do.
      options: { emailRedirectTo: siteUrl('/members') },
    });

    setStatus(error ? { kind: 'error', message: explain(error) } : { kind: 'sent' });
  }

  if (status.kind === 'sent') {
    return (
      <div className="notice">
        <h2>Check your email</h2>
        <p>
          We sent a sign-in link to <strong>{email}</strong>. It’s good for one hour. Open it on
          this device and you’ll be signed straight in — no password to remember.
        </p>
        <p className="hint">
          Nothing arrived? Check spam, then confirm with an officer that we have this address on
          the roster.
        </p>
      </div>
    );
  }

  return (
    <form
      className="signin"
      onSubmit={(event) => {
        event.preventDefault();
        void sendLink();
      }}
    >
      <label htmlFor="email">Email address</label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="btn btn--primary" type="submit" disabled={status.kind === 'sending'}>
        {status.kind === 'sending' ? 'Sending…' : 'Email me a sign-in link'}
      </button>

      {status.kind === 'error' && <p className="error">{status.message}</p>}

      <p className="hint">
        Use the address the chapter has on file. There’s no password — we email you a link each
        time.
      </p>
    </form>
  );
}
