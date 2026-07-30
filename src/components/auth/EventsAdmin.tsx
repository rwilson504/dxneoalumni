import { useEffect, useState } from 'react';
import {
  describeError,
  eventColumns,
  formatPartialDate,
  getSupabase,
  slugify,
  type ChapterEventRow,
  type Member,
} from '~/lib/supabase';

const MAX_UPLOAD = 25 * 1024 * 1024;

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

export default function EventsAdmin({ member }: { member: Member }) {
  const [events, setEvents] = useState<ChapterEventRow[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [pendingImages, setPendingImages] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = getSupabase();
    const [eventRes, uploadRes] = await Promise.all([
      supabase.from('events').select(eventColumns).order('sort_date', { ascending: false }),
      supabase.from('photo_uploads').select('event_id').not('event_id', 'is', null),
    ]);

    setError(describeError(eventRes.error ?? uploadRes.error));
    setEvents((eventRes.data as ChapterEventRow[]) ?? []);
    setPendingImages(new Set(((uploadRes.data as { event_id: string }[]) ?? []).map((u) => u.event_id)));
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

    // The image upload has to name an event id, so a new event is written first and its
    // id read back rather than guessed.
    const { data: saved, error: err } = draft.id
      ? await supabase.from('events').update(row).eq('id', draft.id).select('id').single()
      : await supabase.from('events').insert(row).select('id').single();

    if (err) {
      setSaving(false);
      setError(describeError(err));
      return;
    }

    if (image) {
      const uploadError = await uploadEventImage(saved.id, image, member.id);
      if (uploadError) {
        setSaving(false);
        setError(uploadError);
        return;
      }
    }

    setSaving(false);
    setDraft(null);
    setImage(null);
    await load();
  }

  async function remove(event: ChapterEventRow) {
    if (!window.confirm(`Delete "${event.title}"? Any album linked to it stays, but loses the link.`)) return;
    const { error: err } = await getSupabase().from('events').delete().eq('id', event.id);
    if (err) {
      setError(describeError(err));
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

          <label className="field-wide">
            {draft.id ? 'Replace the event image' : 'Event image'}{' '}
            <span className="hint">optional</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImage(e.target.files?.[0] ?? null)}
            />
          </label>

          {image && image.size > MAX_UPLOAD && (
            <p className="error">That image is over 25 MB and will be rejected.</p>
          )}

          <p className="hint">
            Leave month or day blank if you only know roughly when it happened &mdash; undated
            events sort to the end of their year rather than pretending to a date. A new image
            replaces the old one on the site within a few minutes, once the next build runs.
          </p>

          <div className="row-actions">
            <button className="btn btn--primary" type="button" onClick={save}
              disabled={saving || !draft.title.trim() || !draft.year
                || Boolean(image && image.size > MAX_UPLOAD)}>
              {saving ? 'Saving…' : 'Save event'}
            </button>
            <button className="btn btn--ghost" type="button"
              onClick={() => { setDraft(null); setImage(null); }}>
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
              <td>
                {event.title}
                {pendingImages.has(event.id) && <span className="badge">New image queued</span>}
              </td>
              <td>{formatPartialDate(event.year, event.month, event.day)}</td>
              <td>
                <div className="row-actions">
                  <button className="btn btn--ghost btn--small" type="button"
                    onClick={() => { setDraft(toDraft(event)); setImage(null); }}>
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

/** Parks the file in the uploads bucket for the ingest job; returns a message on failure. */
async function uploadEventImage(eventId: string, file: File, memberId: string) {
  const supabase = getSupabase();

  // An event has one image, so a second upload before the ingest job runs should replace
  // the queued one rather than join it — otherwise both files land in git permanently and
  // only the last would be used.
  const { data: queued } = await supabase
    .from('photo_uploads')
    .select('id, storage_path')
    .eq('event_id', eventId);

  if (queued?.length) {
    await supabase.storage.from('uploads').remove(queued.map((u) => u.storage_path));
    await supabase.from('photo_uploads').delete().eq('event_id', eventId);
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(path, file, { contentType: file.type || 'image/jpeg' });

  if (uploadError) return `The event was saved, but the image failed to upload: ${uploadError.message}`;

  const { error: rowError } = await supabase.from('photo_uploads').insert({
    event_id: eventId,
    storage_path: path,
    caption: file.name.replace(/\.[^.]+$/, ''),
    uploaded_by: memberId,
  });

  if (rowError) {
    // Leaving the object behind would be litter the ingest job never claims.
    await supabase.storage.from('uploads').remove([path]);
    return `The event was saved, but the image could not be queued: ${rowError.message}`;
  }
  return null;
}
