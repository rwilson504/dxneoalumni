import { useEffect, useState } from 'react';
import {
  describeError,
  eventColumns,
  formatPartialDate,
  getSupabase,
  slugify,
  type ChapterEventRow,
} from '~/lib/supabase';

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  year: string;
  month: string;
  day: string;
  image_alt: string;
};

const blank: Draft = {
  id: null, slug: '', title: '', description: '',
  year: String(new Date().getFullYear()), month: '', day: '', image_alt: '',
};

function toDraft(event: ChapterEventRow): Draft {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description ?? '',
    year: String(event.year),
    month: event.month ? String(event.month) : '',
    day: event.day ? String(event.day) : '',
    image_alt: event.image_alt ?? '',
  };
}

export default function EventsAdmin() {
  const [events, setEvents] = useState<ChapterEventRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error: err } = await getSupabase()
      .from('events')
      .select(eventColumns)
      .order('sort_date', { ascending: false });
    setError(describeError(err));
    setEvents((data as ChapterEventRow[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);

    const row = {
      slug: draft.slug.trim() || slugify(draft.title),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      year: Number(draft.year),
      month: draft.month ? Number(draft.month) : null,
      day: draft.day ? Number(draft.day) : null,
      image_alt: draft.image_alt.trim() || null,
    };

    const supabase = getSupabase();
    const { error: err } = draft.id
      ? await supabase.from('events').update(row).eq('id', draft.id)
      : await supabase.from('events').insert(row);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft(null);
    await load();
  }

  async function remove(event: ChapterEventRow) {
    if (!window.confirm(`Delete "${event.title}"? Any album linked to it stays, but loses the link.`)) return;
    const { error: err } = await getSupabase().from('events').delete().eq('id', event.id);
    if (err) {
      setError(err.message);
      return;
    }
    await load();
  }

  if (!events) return <section className="panel"><p className="muted">Loading events…</p></section>;

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Events</h2>
        {!draft && (
          <button className="btn btn--primary btn--small" type="button" onClick={() => setDraft(blank)}>
            Add event
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {draft && (
        <div className="subpanel">
          <h3>{draft.id ? 'Edit event' : 'New event'}</h3>
          <div className="fields">
            <label>
              Title
              <input
                type="text"
                value={draft.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setDraft({ ...draft, title, slug: draft.id ? draft.slug : slugify(title) });
                }}
              />
            </label>
            <label>
              Year
              <input type="number" value={draft.year}
                onChange={(e) => setDraft({ ...draft, year: e.target.value })} />
            </label>
            <label>
              Month <span className="hint">optional</span>
              <input type="number" min="1" max="12" value={draft.month}
                onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
            </label>
            <label>
              Day <span className="hint">optional</span>
              <input type="number" min="1" max="31" value={draft.day}
                onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
            </label>
            <label>
              Image description
              <input type="text" value={draft.image_alt}
                onChange={(e) => setDraft({ ...draft, image_alt: e.target.value })} />
            </label>
            <label>
              Web address
              <input type="text" value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
            </label>
          </div>

          <label className="field-wide">
            Description
            <textarea
              rows={4}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>

          <p className="hint">
            Leave month or day blank if you only know roughly when it happened — undated events
            sort to the end of their year rather than pretending to a date.
          </p>

          <div className="row-actions">
            <button className="btn btn--primary" type="button" onClick={save}
              disabled={saving || !draft.title.trim() || !draft.year}>
              {saving ? 'Saving…' : 'Save event'}
            </button>
            <button className="btn btn--ghost" type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>When</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.title}</td>
              <td>{formatPartialDate(event.year, event.month, event.day)}</td>
              <td>
                <div className="row-actions">
                  <button className="btn btn--ghost btn--small" type="button"
                    onClick={() => setDraft(toDraft(event))}>
                    Edit
                  </button>
                  <button className="btn btn--ghost btn--small" type="button"
                    onClick={() => remove(event)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {events.length === 0 && (
        <p className="muted">
          No events yet. If you expected to see them, the content migration has not been run.
        </p>
      )}
    </section>
  );
}
