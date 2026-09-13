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
import AdminDialog from './AdminDialog';

const MAX_UPLOAD = 25 * 1024 * 1024;

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  location: string;
  date: string;
  image_alt: string;
};

const blank: Draft = {
  id: null, slug: '', title: '', description: '',
  location: '', date: new Date().toISOString().slice(0, 10), image_alt: '',
};

function toDraft(event: ChapterEventRow): Draft {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description ?? '',
    location: event.location ?? '',
    date: `${event.year}-${String(event.month ?? 1).padStart(2, '0')}-${String(event.day ?? 1).padStart(2, '0')}`,
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
    const [year, month, day] = draft.date.split('-').map(Number);

    const row = {
      slug: draft.slug.trim() || slugify(draft.title),
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      location: draft.location.trim() || null,
      year,
      month,
      day,
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

    // Keep the persisted id in the form before uploading. If the upload fails, retrying
    // must update this event rather than insert a duplicate.
    setDraft((current) => current ? { ...current, id: saved.id } : current);

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
        <button className="btn btn--primary btn--small" type="button" disabled={Boolean(draft)}
          onClick={() => setDraft(blank)}>
          Add event
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {draft && (
        <AdminDialog title={draft.id ? 'Edit event' : 'New event'} busy={saving}
          onClose={() => { setDraft(null); setImage(null); }}>
          <div className="admin-dialog__body">
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
              Date
              <input type="date" value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
            </label>
            <label>
              Address <span className="hint">optional</span>
              <input type="text" autoComplete="street-address" value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
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
            A new image replaces the old one on the site within a few minutes, once the next
            build runs.
          </p>

          <div className="row-actions">
            <button className="btn btn--primary" type="button" onClick={save}
              disabled={saving || !draft.title.trim() || !draft.date
                || Boolean(image && image.size > MAX_UPLOAD)}>
              {saving ? 'Saving…' : 'Save event'}
            </button>
            <button className="btn btn--ghost" type="button"
              onClick={() => { setDraft(null); setImage(null); }}>
              Cancel
            </button>
          </div>
          </div>
        </AdminDialog>
      )}

      <table className="table table--responsive">
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
              <td data-label="Event">
                {event.title}
                {pendingImages.has(event.id) && <span className="badge">New image queued</span>}
              </td>
              <td data-label="When">{formatPartialDate(event.year, event.month, event.day)}</td>
              <td data-label="Actions">
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
  // the queued one rather than join it. Otherwise both files land in git permanently and
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
