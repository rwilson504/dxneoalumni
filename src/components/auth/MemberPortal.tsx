import { useCallback, useEffect, useState } from 'react';
import {
  classYearOptions,
  duesColumns,
  getSupabase,
  type DirectoryMember,
  type DuesPayment,
  type DuesMember,
  type Member,
} from '~/lib/supabase';
import { officerRoles } from '~/data/site';
import { useSession } from './useSession';
import SignInPanel from './SignInPanel';
import OfficerDues from './OfficerDues';
import AdminMembers from './AdminMembers';
import EventsAdmin from './EventsAdmin';
import PhotosAdmin from './PhotosAdmin';
import AwardsAdmin from './AwardsAdmin';

type TabId = 'directory' | 'dues' | 'account' | 'officer-dues' | 'events' | 'photos' | 'awards' | 'roster';

export default function MemberPortal({ thumbnails }: { thumbnails: Record<string, string> }) {
  const { loading, session, member, notOnRoster, error: sessionError } = useSession();
  const [directory, setDirectory] = useState<DirectoryMember[] | null>(null);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [duesRoster, setDuesRoster] = useState<DuesMember[] | null>(null);
  const [roster, setRoster] = useState<Member[] | null>(null);
  const [accountMember, setAccountMember] = useState<Member | null>(null);
  const [active, setActive] = useState<TabId>('directory');

  const loadDirectory = useCallback(async () => {
    const { data, error } = await getSupabase().rpc('member_directory');
    setDirectoryError(error?.message ?? null);
    setDirectory((data as DirectoryMember[]) ?? []);
  }, []);

  const loadRoster = useCallback(async () => {
    const { data } = await getSupabase().from('members').select('*').order('full_name');
    setRoster((data as Member[]) ?? []);
  }, []);

  const loadDuesRoster = useCallback(async () => {
    const { data } = await getSupabase().rpc('dues_roster');
    setDuesRoster((data as DuesMember[]) ?? []);
  }, []);

  useEffect(() => {
    if (!member) return;
    setAccountMember(member);
    loadDirectory();
    if (member.role === 'officer' || member.role === 'admin') loadDuesRoster();
    if (member.role === 'admin') loadRoster();
  }, [member, loadDirectory, loadDuesRoster, loadRoster]);

  const accountSaved = useCallback(async (changes: Partial<Member>) => {
    setAccountMember((current) => current ? { ...current, ...changes } : current);
    await loadDirectory();
  }, [loadDirectory]);

  if (loading) return <p className="muted">Checking your sign-in…</p>;
  if (!session) return <SignInPanel />;

  if (sessionError) {
    return (
      <div className="notice">
        <h2>We couldn’t load the member area</h2>
        <p>Please refresh the page and try again. Your sign-in is still active.</p>
        <p className="error">{sessionError}</p>
        <SignOutButton />
      </div>
    );
  }

  if (notOnRoster) {
    return (
      <div className="notice">
        <h2>We don’t recognise that address</h2>
        <p>
          You’re signed in as <strong>{session.user.email}</strong>, but that address isn’t on the
          chapter roster, so there’s nothing here for you yet.
        </p>
        <p className="hint">
          If you’re a paid member, ask an officer to add this address, or sign in with the one the
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
    ...(isAdmin
      ? [
          { id: 'awards' as TabId, label: 'Awards' },
          { id: 'roster' as TabId, label: 'Roster' },
        ]
      : []),
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
        {active === 'directory' && <Directory members={directory} error={directoryError} />}
        {active === 'dues' && <Dues member={member!} />}
        {active === 'account' && (
          <Account member={accountMember ?? member!} onSaved={accountSaved} />
        )}
        {active === 'officer-dues' && duesRoster && (
          <OfficerDues roster={duesRoster} isAdmin={isAdmin} />
        )}
        {active === 'events' && <EventsAdmin member={member!} />}
        {active === 'photos' && <PhotosAdmin member={member!} thumbnails={thumbnails} />}
        {active === 'awards' && <AwardsAdmin />}
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

function Directory({ members, error }: { members: DirectoryMember[] | null; error: string | null }) {
  if (!members) return <section className="panel"><p className="muted">Loading directory…</p></section>;
  if (error) {
    return <section className="panel"><p className="error">Could not load the member directory: {error}</p></section>;
  }

  return (
    <section className="panel">
      <h2>Member directory</h2>
      <p className="muted">
        Contact details shared with signed-in members by {members.length} brothers. Members who
        opted out of the directory are not listed.
      </p>
      <ul className="directory">
        {members.map((m) => {
          const locality = [m.city, m.state].filter(Boolean).join(', ');
          const address = [m.address_line1, m.address_line2,
            [locality, m.postal_code].filter(Boolean).join(' ')].filter(Boolean);
          return (
          <li key={m.id}>
            <div>
              <p className="directory__name">
                {m.full_name}
                {m.officer_letter && (
                  <span className="badge">{officerRoles[m.officer_letter] ?? m.officer_letter}</span>
                )}
                {m.is_current_user && <span className="badge badge--you">You</span>}
              </p>
              <p className="directory__meta">
                {m.undergrad_chapter} {m.class_year}
                {m.is_virtual && ' · Virtual member'}
              </p>
            </div>
            <div className="directory__contact">
              <a href={`mailto:${m.email}`}>{m.email}</a>
              {m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}
              {address.length > 0 && (
                <address>
                  {address.map((line) => <span key={line}>{line}</span>)}
                </address>
              )}
            </div>
          </li>
          );
        })}
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
            <table className="table table--responsive">
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
                    <td data-label="Year">{p.year}</td>
                    <td data-label="Amount">${Number(p.amount).toFixed(2)}</td>
                    <td data-label="Method">{p.method ?? 'Not recorded'}</td>
                    <td data-label="Paid">{p.paid_on}</td>
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

const CLASS_YEARS = classYearOptions();

function Account({
  member,
  onSaved,
}: {
  member: Member;
  onSaved: (changes: Partial<Member>) => Promise<void>;
}) {
  const [form, setForm] = useState({
    phone: member.phone ?? '',
    address_line1: member.address_line1 ?? '',
    address_line2: member.address_line2 ?? '',
    city: member.city ?? '',
    state: member.state ?? '',
    postal_code: member.postal_code ?? '',
    undergrad_chapter: member.undergrad_chapter ?? '',
    class_year: member.class_year ?? '',
    directory_opt_in: member.directory_opt_in,
    phone_directory_opt_in: member.phone_directory_opt_in,
    address_directory_opt_in: member.address_directory_opt_in,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(null);
    const { error } = await getSupabase().from('members').update(form).eq('id', member.id);
    if (!error) await onSaved(form);
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
          <select
            value={form.class_year}
            onChange={(e) => setForm({ ...form, class_year: e.target.value })}
          >
            <option value="">Not listed</option>
            {CLASS_YEARS.map((year) => (
              <option key={year.value} value={year.value}>{year.label}</option>
            ))}
          </select>
        </label>
      </div>

      <h3>Mailing address</h3>
      <div className="fields fields--address">
        <label className="field-span-2">
          Street address
          <input type="text" autoComplete="address-line1" value={form.address_line1}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
        </label>
        <label>
          Apartment, suite, or unit <span className="hint">optional</span>
          <input type="text" autoComplete="address-line2" value={form.address_line2}
            onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
        </label>
        <label>
          City
          <input type="text" autoComplete="address-level2" value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </label>
        <label>
          State
          <input type="text" autoComplete="address-level1" value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </label>
        <label>
          ZIP code
          <input type="text" inputMode="numeric" autoComplete="postal-code" value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
        </label>
      </div>

      <p className="muted">Only signed-in members can view the member directory.</p>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.directory_opt_in}
          onChange={(e) => setForm({
            ...form,
            directory_opt_in: e.target.checked,
            phone_directory_opt_in: e.target.checked ? form.phone_directory_opt_in : false,
            address_directory_opt_in: e.target.checked ? form.address_directory_opt_in : false,
          })}
        />
        List me in the member directory
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.phone_directory_opt_in}
          disabled={!form.directory_opt_in}
          onChange={(e) => setForm({ ...form, phone_directory_opt_in: e.target.checked })}
        />
        Share my phone number in the member directory
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={form.address_directory_opt_in}
          disabled={!form.directory_opt_in}
          onChange={(e) => setForm({ ...form, address_directory_opt_in: e.target.checked })}
        />
        Share my mailing address in the member directory
      </label>

      <button className="btn btn--primary" type="button" onClick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
      {saved && <p className="hint" role="status" aria-live="polite">{saved}</p>}
    </section>
  );
}
