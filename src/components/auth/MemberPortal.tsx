import { useEffect, useState } from 'react';
import { getSupabase, type DuesPayment, type Member } from '~/lib/supabase';
import { useSession } from './useSession';
import SignInPanel from './SignInPanel';

const officerRoles: Record<string, string> = {
  A: 'President',
  B: 'Director of Programming',
  C: 'Secretary',
  D: 'Treasurer',
  E: 'Director of Membership',
};

export default function MemberPortal() {
  const { loading, session, member, notOnRoster } = useSession();

  if (loading) return <p className="muted">Checking your sign-in…</p>;
  if (!session) return <SignInPanel />;

  if (notOnRoster) {
    return (
      <div className="notice">
        <h2>We don’t recognise that address</h2>
        <p>
          You’re signed in as <strong>{session.user.email}</strong>, but that address isn’t on the
          chapter roster, so there’s nothing here for you yet.
        </p>
        <p className="hint">
          If you’re a paid member, ask an officer to add this address — or sign in with the one the
          chapter already has.
        </p>
        <SignOutButton />
      </div>
    );
  }

  return (
    <div className="portal">
      <header className="portal__head">
        <div>
          <p className="eyebrow">Member area</p>
          <h1>Welcome back, {member!.full_name.split(' ')[0]}</h1>
        </div>
        <SignOutButton />
      </header>

      <Directory currentMember={member!} />
      <Dues member={member!} />
      <Account member={member!} />
    </div>
  );
}

function SignOutButton() {
  return (
    <button
      className="btn btn--ghost"
      type="button"
      onClick={async () => {
        await getSupabase().auth.signOut();
        window.location.reload();
      }}
    >
      Sign out
    </button>
  );
}

function Directory({ currentMember }: { currentMember: Member }) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    getSupabase()
      .from('members')
      .select('*')
      .order('full_name')
      .then(({ data }) => setMembers(data ?? []));
  }, []);

  if (!members) return <section className="panel"><p className="muted">Loading directory…</p></section>;

  return (
    <section className="panel">
      <h2>Member directory</h2>
      <p className="muted">
        Contact details for {members.length} brothers. Members who opted out of the directory are
        not listed.
      </p>
      <ul className="directory">
        {members.map((m) => (
          <li key={m.id}>
            <div>
              <p className="directory__name">
                {m.full_name}
                {m.officer_letter && (
                  <span className="badge">{officerRoles[m.officer_letter] ?? m.officer_letter}</span>
                )}
                {m.id === currentMember.id && <span className="badge badge--you">You</span>}
              </p>
              <p className="directory__meta">
                {m.undergrad_chapter} {m.class_year}
                {m.is_virtual && ' · Virtual member'}
              </p>
            </div>
            <div className="directory__contact">
              <a href={`mailto:${m.email}`}>{m.email}</a>
              {m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dues({ member }: { member: Member }) {
  const [payments, setPayments] = useState<DuesPayment[] | null>(null);

  useEffect(() => {
    getSupabase()
      .from('dues_payments')
      .select('id, year, amount, method, paid_on')
      .eq('member_id', member.id)
      .order('year', { ascending: false })
      .then(({ data }) => setPayments(data ?? []));
  }, [member.id]);

  const currentYear = new Date().getFullYear();
  const paidThisYear = payments?.some((p) => p.year === currentYear);

  return (
    <section className="panel">
      <h2>Your dues</h2>
      {!payments && <p className="muted">Loading…</p>}
      {payments && (
        <>
          <p className={paidThisYear ? 'status status--ok' : 'status status--due'}>
            {paidThisYear ? `Paid up for ${currentYear}` : `No payment recorded for ${currentYear}`}
          </p>
          {payments.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Paid</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{p.year}</td>
                    <td>${Number(p.amount).toFixed(2)}</td>
                    <td>{p.method ?? '—'}</td>
                    <td>{p.paid_on}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function Account({ member }: { member: Member }) {
  const [form, setForm] = useState({
    phone: member.phone ?? '',
    undergrad_chapter: member.undergrad_chapter ?? '',
    class_year: member.class_year ?? '',
    directory_opt_in: member.directory_opt_in,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(null);
    const { error } = await getSupabase().from('members').update(form).eq('id', member.id);
    setSaving(false);
    setSaved(error ? error.message : 'Saved.');
  }

  return (
    <section className="panel">
      <h2>Your details</h2>
      <p className="muted">
        Email address and officer role are managed by the chapter officers. Everything else is
        yours to edit.
      </p>

      <div className="fields">
        <label>
          Phone
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label>
          Undergraduate chapter
          <input
            type="text"
            value={form.undergrad_chapter}
            onChange={(e) => setForm({ ...form, undergrad_chapter: e.target.value })}
          />
        </label>
        <label>
          Class year
          <input
            type="text"
            value={form.class_year}
            onChange={(e) => setForm({ ...form, class_year: e.target.value })}
          />
        </label>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.directory_opt_in}
          onChange={(e) => setForm({ ...form, directory_opt_in: e.target.checked })}
        />
        List me in the member directory
      </label>

      <button className="btn btn--primary" type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
      {saved && <p className="hint">{saved}</p>}
    </section>
  );
}
