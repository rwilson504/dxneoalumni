import { useCallback, useEffect, useState } from 'react';
import { duesColumns, getSupabase, type DuesPayment, type Member } from '~/lib/supabase';
import { officerRoles } from '~/data/site';
import { useSession } from './useSession';
import SignInPanel from './SignInPanel';
import OfficerDues from './OfficerDues';
import AdminMembers from './AdminMembers';
import EventsAdmin from './EventsAdmin';
import PhotosAdmin from './PhotosAdmin';

type TabId = 'directory' | 'dues' | 'account' | 'officer-dues' | 'events' | 'photos' | 'roster';

export default function MemberPortal() {
  const { loading, session, member, notOnRoster } = useSession();
  const [roster, setRoster] = useState<Member[] | null>(null);
  const [active, setActive] = useState<TabId>('directory');

  const loadRoster = useCallback(async () => {
    const { data } = await getSupabase().from('members').select('*').order('full_name');
    setRoster((data as Member[]) ?? []);
  }, []);

  useEffect(() => {
    if (member) loadRoster();
  }, [member, loadRoster]);

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

  const isOfficer = member!.role === 'officer' || member!.role === 'admin';
  const isAdmin = member!.role === 'admin';

  const tabs: { id: TabId; label: string }[] = [
    { id: 'directory', label: 'Directory' },
    { id: 'dues', label: 'My dues' },
    { id: 'account', label: 'My details' },
    ...(isOfficer
      ? [
          { id: 'officer-dues' as TabId, label: 'Dues admin' },
          { id: 'events' as TabId, label: 'Events' },
          { id: 'photos' as TabId, label: 'Photos' },
        ]
      : []),
    ...(isAdmin ? [{ id: 'roster' as TabId, label: 'Roster' }] : []),
  ];

  return (
    <div className="portal">
      <header className="portal__head">
        <div>
          <p className="eyebrow">Member area</p>
          <h1>Welcome back, {member!.full_name.split(' ')[0]}</h1>
        </div>
        <SignOutButton />
      </header>

      <Tabs tabs={tabs} active={active} onSelect={setActive} />

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'directory' && <Directory roster={roster} currentMember={member!} />}
        {active === 'dues' && <Dues member={member!} />}
        {active === 'account' && <Account member={member!} />}
        {active === 'officer-dues' && roster && <OfficerDues roster={roster} />}
        {active === 'events' && <EventsAdmin member={member!} />}
        {active === 'photos' && <PhotosAdmin member={member!} />}
        {active === 'roster' && roster && (
          <AdminMembers roster={roster} currentMember={member!} onChanged={loadRoster} />
        )}
      </div>
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: TabId; label: string }[];
  active: TabId;
  onSelect: (id: TabId) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Member area sections">
      {tabs.map((tab, i) => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          role="tab"
          type="button"
          className={tab.id === active ? 'tab tab--active' : 'tab'}
          aria-selected={tab.id === active}
          aria-controls={`panel-${tab.id}`}
          tabIndex={tab.id === active ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            const next = tabs[(i + step + tabs.length) % tabs.length];
            onSelect(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}
        >
          {tab.label}
        </button>
      ))}
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

function Directory({ roster, currentMember }: { roster: Member[] | null; currentMember: Member }) {
  if (!roster) return <section className="panel"><p className="muted">Loading directory…</p></section>;

  // Officers can read every row, so the opt-out has to be honoured here rather than
  // relying on the query to return only listed members.
  const listed = roster.filter((m) => m.directory_opt_in || m.id === currentMember.id);

  return (
    <section className="panel">
      <h2>Member directory</h2>
      <p className="muted">
        Contact details for {listed.length} brothers. Members who opted out of the directory are
        not listed.
      </p>
      <ul className="directory">
        {listed.map((m) => (
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
      .select(duesColumns)
      .eq('member_id', member.id)
      .order('year', { ascending: false })
      .then(({ data }) => setPayments((data as DuesPayment[]) ?? []));
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
