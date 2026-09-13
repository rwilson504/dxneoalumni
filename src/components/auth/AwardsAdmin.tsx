import { useEffect, useState } from 'react';
import { getSupabase, matchesSearch, type AwardType, type ChapterAward } from '~/lib/supabase';
import AdminDialog from './AdminDialog';
import SearchField from './SearchField';

type TypeDraft = { id: string | null; name: string; description: string };
type AwardDraft = { id: string | null; award_type_id: string; period_start: string; recipient: string };

const blankType: TypeDraft = { id: null, name: '', description: '' };
const blankAward: AwardDraft = {
  id: null,
  award_type_id: '',
  period_start: String(new Date().getFullYear() - 1),
  recipient: '',
};

export default function AwardsAdmin() {
  const [types, setTypes] = useState<AwardType[] | null>(null);
  const [awards, setAwards] = useState<ChapterAward[] | null>(null);
  const [typeDraft, setTypeDraft] = useState<TypeDraft | null>(null);
  const [awardDraft, setAwardDraft] = useState<AwardDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [awardQuery, setAwardQuery] = useState('');
  const [typeQuery, setTypeQuery] = useState('');

  async function load() {
    const supabase = getSupabase();
    const [typeResult, awardResult] = await Promise.all([
      supabase.from('award_types').select('id, name, description, is_active').order('name'),
      supabase.from('chapter_awards').select('id, award_type_id, period_start, recipient')
        .order('period_start', { ascending: false }),
    ]);
    setError(typeResult.error?.message ?? awardResult.error?.message ?? null);
    setTypes((typeResult.data as AwardType[]) ?? []);
    setAwards((awardResult.data as ChapterAward[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveType() {
    if (!typeDraft) return;
    setSaving(true);
    const row = {
      name: typeDraft.name.trim(),
      description: typeDraft.description.trim() || null,
    };
    const { error: saveError } = typeDraft.id
      ? await getSupabase().from('award_types').update(row).eq('id', typeDraft.id)
      : await getSupabase().from('award_types').insert(row);
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setTypeDraft(null);
    await load();
  }

  async function setTypeActive(type: AwardType, isActive: boolean) {
    const { error: saveError } = await getSupabase()
      .from('award_types').update({ is_active: isActive }).eq('id', type.id);
    if (saveError) return setError(saveError.message);
    await load();
  }

  async function saveAward() {
    if (!awardDraft) return;
    setSaving(true);
    const row = {
      award_type_id: awardDraft.award_type_id,
      period_start: Number(awardDraft.period_start),
      recipient: awardDraft.recipient.trim() || null,
    };
    const { error: saveError } = awardDraft.id
      ? await getSupabase().from('chapter_awards').update(row).eq('id', awardDraft.id)
      : await getSupabase().from('chapter_awards').insert(row);
    setSaving(false);
    if (saveError) return setError(saveError.message);
    setAwardDraft(null);
    await load();
  }

  async function removeAward(award: ChapterAward) {
    if (!window.confirm('Delete this chapter award record?')) return;
    const { error: removeError } = await getSupabase().from('chapter_awards').delete().eq('id', award.id);
    if (removeError) return setError(removeError.message);
    await load();
  }

  if (!types || !awards) return <section className="panel"><p className="muted">Loading awards…</p></section>;
  const typeName = (id: string) => types.find((type) => type.id === id)?.name ?? 'Unknown award';
  const selectableTypes = types.filter((type) => type.is_active || type.id === awardDraft?.award_type_id);
  const filteredAwards = awards.filter((award) => matchesSearch(
    awardQuery,
    award.period_start,
    award.period_start + 1,
    typeName(award.award_type_id),
    award.recipient,
  ));
  const filteredTypes = types.filter((type) => matchesSearch(
    typeQuery,
    type.name,
    type.description,
    type.is_active ? 'active' : 'inactive',
  ));

  return (
    <>
      <section className="panel">
        <div className="panel__head">
          <h2>Chapter awards</h2>
          <button className="btn btn--primary btn--small" type="button" disabled={Boolean(awardDraft)}
            onClick={() => setAwardDraft({ ...blankAward, award_type_id: selectableTypes[0]?.id ?? '' })}>
            Add award
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <SearchField value={awardQuery} onChange={setAwardQuery} label="Search chapter awards"
          resultCount={filteredAwards.length} totalCount={awards.length} />
        {awardDraft && (
          <AdminDialog title={awardDraft.id ? 'Edit award' : 'Add award'} busy={saving}
            onClose={() => setAwardDraft(null)}>
            <div className="admin-dialog__body">
            <div className="fields">
              <label>
                Award
                <select value={awardDraft.award_type_id}
                  onChange={(event) => setAwardDraft({ ...awardDraft, award_type_id: event.target.value })}>
                  {selectableTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
                </select>
              </label>
              <label>
                Period starting year
                <input type="number" min="1900" max="2200" value={awardDraft.period_start}
                  onChange={(event) => setAwardDraft({ ...awardDraft, period_start: event.target.value })} />
              </label>
              <label>
                Recipient <span className="hint">optional</span>
                <input type="text" value={awardDraft.recipient}
                  onChange={(event) => setAwardDraft({ ...awardDraft, recipient: event.target.value })} />
              </label>
            </div>
            <div className="row-actions">
              <button className="btn btn--primary" type="button" onClick={saveAward}
                disabled={saving || !awardDraft.award_type_id || !awardDraft.period_start}>
                {saving ? 'Saving…' : 'Save award'}
              </button>
              <button className="btn btn--ghost" type="button" onClick={() => setAwardDraft(null)}>Cancel</button>
            </div>
            </div>
          </AdminDialog>
        )}
        <table className="table table--responsive">
          <thead><tr><th>Period</th><th>Award</th><th>Recipient</th><th aria-label="Actions" /></tr></thead>
          <tbody>
            {filteredAwards.map((award) => (
              <tr key={award.id}>
                <td data-label="Period">{award.period_start} - {award.period_start + 1}</td>
                <td data-label="Award">{typeName(award.award_type_id)}</td>
                <td data-label="Recipient">{award.recipient ?? 'None'}</td>
                <td data-label="Actions"><div className="row-actions">
                  <button className="btn btn--ghost btn--small" type="button" onClick={() => setAwardDraft({
                    id: award.id,
                    award_type_id: award.award_type_id,
                    period_start: String(award.period_start),
                    recipient: award.recipient ?? '',
                  })}>Edit</button>
                  <button className="btn btn--ghost btn--small" type="button"
                    onClick={() => removeAward(award)}>Delete</button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredAwards.length === 0 && <p className="muted empty-results">No awards match your search.</p>}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Award types</h2>
          <button className="btn btn--primary btn--small" type="button" disabled={Boolean(typeDraft)}
            onClick={() => setTypeDraft(blankType)}>Add award type</button>
        </div>
        <p className="muted">Inactive types stay attached to historical awards but cannot be selected for new ones.</p>
        <SearchField value={typeQuery} onChange={setTypeQuery} label="Search award types"
          resultCount={filteredTypes.length} totalCount={types.length} />
        {typeDraft && (
          <AdminDialog title={typeDraft.id ? 'Edit award type' : 'Add award type'} busy={saving}
            onClose={() => setTypeDraft(null)}>
            <div className="admin-dialog__body">
            <div className="fields">
              <label>Award name<input type="text" value={typeDraft.name}
                onChange={(event) => setTypeDraft({ ...typeDraft, name: event.target.value })} /></label>
              <label className="field-span-2">Description<textarea rows={3} value={typeDraft.description}
                onChange={(event) => setTypeDraft({ ...typeDraft, description: event.target.value })} /></label>
            </div>
            <div className="row-actions">
              <button className="btn btn--primary" type="button" onClick={saveType}
                disabled={saving || !typeDraft.name.trim()}>{saving ? 'Saving…' : 'Save award type'}</button>
              <button className="btn btn--ghost" type="button" onClick={() => setTypeDraft(null)}>Cancel</button>
            </div>
            </div>
          </AdminDialog>
        )}
        <ul className="admin-list">
          {filteredTypes.map((type) => <li key={type.id} className={type.is_active ? undefined : 'is-inactive'}>
            <div><strong>{type.name}</strong>{type.description && <p className="muted">{type.description}</p>}</div>
            <div className="row-actions">
              <button className="btn btn--ghost btn--small" type="button"
                onClick={() => setTypeDraft({ id: type.id, name: type.name, description: type.description ?? '' })}>Edit</button>
              <button className="btn btn--ghost btn--small" type="button"
                onClick={() => setTypeActive(type, !type.is_active)}>
                {type.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </li>)}
        </ul>
        {filteredTypes.length === 0 && <p className="muted empty-results">No award types match your search.</p>}
      </section>
    </>
  );
}