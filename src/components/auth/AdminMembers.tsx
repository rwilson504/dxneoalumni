import { useState } from 'react';
import { getSupabase, type Member, type MemberRole } from '~/lib/supabase';
import { officerRoles } from '~/data/site';

const ROLES: MemberRole[] = ['member', 'officer', 'admin'];

const emptyDraft = {
  full_name: '',
  email: '',
  undergrad_chapter: '',
  class_year: '',
  is_virtual: false,
};

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

  async function remove(member: Member) {
    const confirmed = window.confirm(
      `Remove ${member.full_name} from the roster? Their dues history is deleted too, and they lose access immediately.`
    );
    if (!confirmed) return;

    setBusyId(member.id);
    const { error: err } = await getSupabase().from('members').delete().eq('id', member.id);
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
      <h2>Roster administration</h2>
      <p className="muted">
        Adding someone here is what lets them sign in — the address must match the one they use.
        Roles and officer letters can only be changed from this panel.
      </p>

      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Email</th>
            <th>Role</th>
            <th>Officer</th>
            <th>Signed in</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {roster.map((m) => {
            const isSelf = m.id === currentMember.id;
            return (
              <tr key={m.id}>
                <td>{m.full_name}</td>
                <td>{m.email}</td>
                <td>
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
                <td>
                  <select
                    className="cell-input"
                    value={m.officer_letter ?? ''}
                    disabled={busyId === m.id}
                    onChange={(e) => patch(m, { officer_letter: e.target.value || null })}
                    aria-label={`Officer letter for ${m.full_name}`}
                  >
                    <option value="">—</option>
                    {Object.entries(officerRoles).map(([letter, title]) => (
                      <option key={letter} value={letter}>
                        {title}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{m.user_id ? 'Yes' : 'Not yet'}</td>
                <td>
                  {!isSelf && (
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => remove(m)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <AddMember onAdded={onChanged} onError={setError} />
    </section>
  );
}

function AddMember({
  onAdded,
  onError,
}: {
  onAdded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const ready = draft.full_name.trim() !== '' && draft.email.trim() !== '';

  async function add() {
    setSaving(true);
    const { error } = await getSupabase()
      .from('members')
      .insert({
        full_name: draft.full_name.trim(),
        email: draft.email.trim(),
        undergrad_chapter: draft.undergrad_chapter.trim() || null,
        class_year: draft.class_year.trim() || null,
        is_virtual: draft.is_virtual,
      });
    setSaving(false);

    if (error) {
      onError(error.message);
      return;
    }
    onError(null);
    setDraft(emptyDraft);
    await onAdded();
  }

  return (
    <div className="subpanel">
      <h3>Add a member</h3>
      <div className="fields">
        <label>
          Full name
          <input
            type="text"
            value={draft.full_name}
            onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
          />
        </label>
        <label>
          Email
          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </label>
        <label>
          Undergraduate chapter
          <input
            type="text"
            value={draft.undergrad_chapter}
            onChange={(e) => setDraft({ ...draft, undergrad_chapter: e.target.value })}
          />
        </label>
        <label>
          Class year
          <input
            type="text"
            value={draft.class_year}
            onChange={(e) => setDraft({ ...draft, class_year: e.target.value })}
          />
        </label>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={draft.is_virtual}
          onChange={(e) => setDraft({ ...draft, is_virtual: e.target.checked })}
        />
        Virtual member
      </label>

      <button className="btn btn--primary" type="button" onClick={add} disabled={!ready || saving}>
        {saving ? 'Adding…' : 'Add member'}
      </button>
    </div>
  );
}
