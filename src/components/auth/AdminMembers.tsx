import { useState } from 'react';
import { classYearOptions, getSupabase, type Member, type MemberRole } from '~/lib/supabase';
import { officerRoles } from '~/data/site';

const ROLES: MemberRole[] = ['member', 'officer', 'admin'];
const CLASS_YEARS = classYearOptions();

type MemberDraft = {
  id: string | null;
  full_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  undergrad_chapter: string;
  class_year: string;
  is_virtual: boolean;
};

const emptyDraft: MemberDraft = {
  id: null,
  full_name: '',
  email: '',
  phone: '',
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  undergrad_chapter: '',
  class_year: '',
  is_virtual: false,
};

function toDraft(member: Member): MemberDraft {
  return {
    id: member.id,
    full_name: member.full_name,
    email: member.email,
    phone: member.phone ?? '',
    address_line1: member.address_line1 ?? '',
    address_line2: member.address_line2 ?? '',
    city: member.city ?? '',
    state: member.state ?? '',
    postal_code: member.postal_code ?? '',
    undergrad_chapter: member.undergrad_chapter ?? '',
    class_year: member.class_year ?? '',
    is_virtual: member.is_virtual,
  };
}

type SortOrder = 'name-asc' | 'name-desc' | 'email-asc' | 'active-first' | 'inactive-first';

export default function AdminMembers({
  roster,
  currentMember,
  onChanged,
}: {
  roster: Member[];
  currentMember: Member;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MemberDraft | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc');

  const sortedRoster = [...roster].sort((left, right) => {
    if (sortOrder === 'name-desc') return right.full_name.localeCompare(left.full_name);
    if (sortOrder === 'email-asc') return left.email.localeCompare(right.email);
    if (sortOrder === 'active-first' || sortOrder === 'inactive-first') {
      const direction = sortOrder === 'active-first' ? -1 : 1;
      const activeDifference = Number(left.is_active) - Number(right.is_active);
      return activeDifference ? activeDifference * direction : left.full_name.localeCompare(right.full_name);
    }
    return left.full_name.localeCompare(right.full_name);
  });

  async function patch(member: Member, changes: Partial<Member>) {
    setBusyId(member.id);
    const { error: err } = await getSupabase().from('members').update(changes).eq('id', member.id);
    setBusyId(null);

    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    await onChanged();
  }

  async function setActive(member: Member, isActive: boolean) {
    const action = isActive ? 'Reactivate' : 'Deactivate';
    const detail = isActive
      ? 'They will regain member-area access.'
      : 'They will lose member-area access, but their profile and dues history will be kept.';
    const confirmed = window.confirm(`${action} ${member.full_name}? ${detail}`);
    if (!confirmed) return;

    setBusyId(member.id);
    const { error: err } = await getSupabase()
      .from('members')
      .update({ is_active: isActive })
      .eq('id', member.id);
    setBusyId(null);

    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    await onChanged();
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Roster administration</h2>
        {!draft && (
          <button className="btn btn--primary btn--small" type="button"
            onClick={() => setDraft(emptyDraft)}>
            Add member
          </button>
        )}
      </div>
      <p className="muted">
        Adding someone here is what lets them sign in. The email address must match the one they use.
        Roles and officer letters can only be changed from this panel. Deactivated members keep
        their history but cannot sign in or appear in the directory.
      </p>

      {error && <p className="error">{error}</p>}

      {draft && (
        <MemberForm
          draft={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSaved={async () => {
            setDraft(null);
            setError(null);
            await onChanged();
          }}
          onError={setError}
        />
      )}

      <div className="table-tools">
        <label className="inline-field">
          Sort
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as SortOrder)}>
            <option value="name-asc">Name, A to Z</option>
            <option value="name-desc">Name, Z to A</option>
            <option value="email-asc">Email, A to Z</option>
            <option value="active-first">Active first</option>
            <option value="inactive-first">Inactive first</option>
          </select>
        </label>
      </div>

      <table className="table table--responsive">
        <thead>
          <tr>
            <th>Member</th>
            <th>Contact</th>
            <th>Role</th>
            <th>Officer</th>
            <th>Status</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sortedRoster.map((m) => {
            const isSelf = m.id === currentMember.id;
            return (
              <tr key={m.id} className={m.is_active ? undefined : 'is-inactive'}>
                <td data-label="Member">{m.full_name}</td>
                <td data-label="Contact">
                  <div className="admin-contact">
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                    {m.phone && <a href={`tel:${m.phone}`}>{m.phone}</a>}
                    {(m.address_line1 || m.city || m.state || m.postal_code) && (
                      <address>
                        {m.address_line1 && <span>{m.address_line1}</span>}
                        {m.address_line2 && <span>{m.address_line2}</span>}
                        <span>{[[m.city, m.state].filter(Boolean).join(', '), m.postal_code]
                          .filter(Boolean).join(' ')}</span>
                      </address>
                    )}
                  </div>
                </td>
                <td data-label="Role">
                  <select
                    className="cell-input"
                    value={m.role}
                    disabled={isSelf || busyId === m.id}
                    onChange={(e) => patch(m, { role: e.target.value as MemberRole })}
                    aria-label={`Role for ${m.full_name}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="Officer">
                  <select
                    className="cell-input"
                    value={m.officer_letter ?? ''}
                    disabled={busyId === m.id}
                    onChange={(e) => patch(m, { officer_letter: e.target.value || null })}
                    aria-label={`Officer letter for ${m.full_name}`}
                  >
                    <option value="">None</option>
                    {Object.entries(officerRoles).map(([letter, title]) => (
                      <option key={letter} value={letter}>
                        {title}
                      </option>
                    ))}
                  </select>
                </td>
                <td data-label="Status">
                  {m.is_active ? (m.user_id ? 'Active, signed in' : 'Active, not signed in') : 'Inactive'}
                </td>
                <td data-label="Actions">
                  <div className="row-actions">
                    <button className="btn btn--ghost btn--small" type="button"
                      disabled={busyId === m.id} onClick={() => setDraft(toDraft(m))}>
                      Edit
                    </button>
                    {!isSelf && (
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => setActive(m, !m.is_active)}
                      >
                        {m.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function MemberForm({
  draft,
  onChange,
  onCancel,
  onSaved,
  onError,
}: {
  draft: MemberDraft;
  onChange: (draft: MemberDraft) => void;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [saving, setSaving] = useState(false);

  const ready = draft.full_name.trim() !== '' && draft.email.trim() !== '';

  async function save() {
    setSaving(true);
    const row = {
      full_name: draft.full_name.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim() || null,
      address_line1: draft.address_line1.trim() || null,
      address_line2: draft.address_line2.trim() || null,
      city: draft.city.trim() || null,
      state: draft.state.trim() || null,
      postal_code: draft.postal_code.trim() || null,
      undergrad_chapter: draft.undergrad_chapter.trim() || null,
      class_year: draft.class_year || null,
      is_virtual: draft.is_virtual,
    };
    const { error } = draft.id
      ? await getSupabase().from('members').update(row).eq('id', draft.id)
      : await getSupabase().from('members').insert(row);
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }
    onError(null);
    await onSaved();
  }

  return (
    <div className="subpanel">
      <h3>{draft.id ? 'Edit member' : 'Add member'}</h3>
      <div className="fields">
        <label>
          Full name
          <input
            type="text"
            value={draft.full_name}
            onChange={(e) => onChange({ ...draft, full_name: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
          />
        </label>
        <label>
          Phone
          <input type="tel" value={draft.phone}
            onChange={(e) => onChange({ ...draft, phone: e.target.value })} />
        </label>
        <label>
          Undergraduate chapter
          <input
            type="text"
            value={draft.undergrad_chapter}
            onChange={(e) => onChange({ ...draft, undergrad_chapter: e.target.value })}
          />
        </label>
        <label>
          Class year
          <select
            value={draft.class_year}
            onChange={(e) => onChange({ ...draft, class_year: e.target.value })}
          >
            <option value="">Not listed</option>
            {CLASS_YEARS.map((year) => (
              <option key={year.value} value={year.value}>{year.label}</option>
            ))}
          </select>
        </label>
      </div>

      <h4>Mailing address</h4>
      <div className="fields fields--address">
        <label className="field-span-2">
          Street address
          <input type="text" autoComplete="address-line1" value={draft.address_line1}
            onChange={(e) => onChange({ ...draft, address_line1: e.target.value })} />
        </label>
        <label>
          Apartment, suite, or unit <span className="hint">optional</span>
          <input type="text" autoComplete="address-line2" value={draft.address_line2}
            onChange={(e) => onChange({ ...draft, address_line2: e.target.value })} />
        </label>
        <label>
          City
          <input type="text" autoComplete="address-level2" value={draft.city}
            onChange={(e) => onChange({ ...draft, city: e.target.value })} />
        </label>
        <label>
          State
          <input type="text" autoComplete="address-level1" value={draft.state}
            onChange={(e) => onChange({ ...draft, state: e.target.value })} />
        </label>
        <label>
          ZIP code
          <input type="text" inputMode="numeric" autoComplete="postal-code" value={draft.postal_code}
            onChange={(e) => onChange({ ...draft, postal_code: e.target.value })} />
        </label>
      </div>

      {draft.id && (
        <p className="hint">
          For a member who has already signed in, changing this email updates the roster contact
          address but does not change the email on their sign-in account.
        </p>
      )}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.is_virtual}
          onChange={(e) => onChange({ ...draft, is_virtual: e.target.checked })}
        />
        Virtual member
      </label>

      <div className="row-actions">
        <button className="btn btn--primary" type="button" onClick={save} disabled={!ready || saving}>
          {saving ? 'Saving…' : draft.id ? 'Save member' : 'Add member'}
        </button>
        <button className="btn btn--ghost" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}
