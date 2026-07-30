import { Fragment, useEffect, useState } from 'react';
import {
  albumColumns,
  describeError,
  eventColumns,
  formatPartialDate,
  getSupabase,
  photoColumns,
  slugify,
  type Album,
  type ChapterEventRow,
  type Member,
  type Photo,
  type PhotoUpload,
} from '~/lib/supabase';

const MAX_UPLOAD = 25 * 1024 * 1024;

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  event_id: string;
  year: string;
  month: string;
  day: string;
};

const blank: Draft = { id: null, slug: '', title: '', event_id: '', year: '', month: '', day: '' };

export default function PhotosAdmin({
  member,
  thumbnails,
}: {
  member: Member;
  thumbnails: Record<string, string>;
}) {
  const [albums, setAlbums] = useState<Album[] | null>(null);
  const [events, setEvents] = useState<ChapterEventRow[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pending, setPending] = useState<PhotoUpload[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = getSupabase();
    const [albumRes, eventRes, photoRes, pendingRes] = await Promise.all([
      supabase.from('albums').select(albumColumns).order('sort_date', { ascending: false, nullsFirst: false }),
      supabase.from('events').select(eventColumns).order('sort_date', { ascending: false }),
      supabase.from('photos').select(photoColumns).order('sort_order'),
      supabase.from('photo_uploads').select('id, album_id, event_id, storage_path, caption, error, created_at')
        .order('created_at'),
    ]);

    const firstError = albumRes.error ?? eventRes.error ?? photoRes.error ?? pendingRes.error;
    setError(describeError(firstError));

    setAlbums((albumRes.data as Album[]) ?? []);
    setEvents((eventRes.data as ChapterEventRow[]) ?? []);
    setPhotos((photoRes.data as Photo[]) ?? []);
    setPending((pendingRes.data as PhotoUpload[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function saveAlbum() {
    if (!draft) return;
    setSaving(true);
    setError(null);

    const row = {
      slug: draft.slug.trim() || slugify(draft.title),
      title: draft.title.trim(),
      event_id: draft.event_id || null,
      year: draft.year ? Number(draft.year) : null,
      month: draft.month ? Number(draft.month) : null,
      day: draft.day ? Number(draft.day) : null,
    };

    const supabase = getSupabase();
    const { error: err } = draft.id
      ? await supabase.from('albums').update(row).eq('id', draft.id)
      : await supabase.from('albums').insert(row);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft(null);
    await load();
  }

  async function removeAlbum(album: Album) {
    const count = photos.filter((p) => p.album_id === album.id).length;
    const warning = count
      ? `Delete "${album.title}"? Its ${count} photo record(s) go too, permanently. The image files stay in the repository.`
      : `Delete the empty album "${album.title}"?`;
    if (!window.confirm(warning)) return;

    const { error: err } = await getSupabase().from('albums').delete().eq('id', album.id);
    if (err) {
      setError(describeError(err));
      return;
    }
    await load();
  }

  /** Taking a photo down is reversible: the row stays, the public build skips it. */
  async function setRemoved(photo: Photo, removed: boolean) {
    const { error: err } = await getSupabase()
      .from('photos')
      .update({ removed_at: removed ? new Date().toISOString() : null })
      .eq('id', photo.id);

    if (err) {
      setError(describeError(err));
      return;
    }
    await load();
  }

  if (!albums) return <section className="panel"><p className="muted">Loading albums…</p></section>;

  const eventTitle = (id: string | null) =>
    id ? events.find((e) => e.id === id)?.title ?? '—' : '—';

  return (
    <>
      <Uploader albums={albums} member={member} onUploaded={load} onError={setError} />

      {pending.length > 0 && (
        <section className="panel">
          <h2>Waiting to be published</h2>
          <p className="muted">
            These are queued. A scheduled job adds them to the site and they disappear from
            this list — usually within a few minutes of the next build.
          </p>
          <ul className="directory">
            {pending.map((upload) => (
              <li key={upload.id}>
                <div>
                  <p className="directory__name">{upload.caption || upload.storage_path}</p>
                  <p className="directory__meta">
                    {upload.album_id
                      ? albums.find((a) => a.id === upload.album_id)?.title ?? 'Unknown album'
                      : 'Event image'}
                  </p>
                </div>
                {upload.error && <span className="error">{upload.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>Albums</h2>
          {!draft && (
            <button className="btn btn--primary btn--small" type="button" onClick={() => setDraft(blank)}>
              Add album
            </button>
          )}
        </div>

        {error && <p className="error">{error}</p>}

        {draft && (
          <div className="subpanel">
            <h3>{draft.id ? 'Edit album' : 'New album'}</h3>
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
                Year <span className="hint">optional</span>
                <input type="number" value={draft.year}
                  onChange={(e) => setDraft({ ...draft, year: e.target.value })} />
              </label>
              <label>
                Month <span className="hint">optional</span>
                <input type="number" min="1" max="12" value={draft.month}
                  onChange={(e) => setDraft({ ...draft, month: e.target.value })} />
              </label>
            </div>

            <label className="field-wide">
              Linked event <span className="hint">optional — leave blank for albums that aren’t an event</span>
              <select value={draft.event_id}
                onChange={(e) => setDraft({ ...draft, event_id: e.target.value })}>
                <option value="">Not linked to an event</option>
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title} ({event.year})
                  </option>
                ))}
              </select>
            </label>

            <div className="row-actions">
              <button className="btn btn--primary" type="button" onClick={saveAlbum}
                disabled={saving || !draft.title.trim()}>
                {saving ? 'Saving…' : 'Save album'}
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
              <th>Album</th>
              <th>When</th>
              <th>Photos</th>
              <th>Event</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {albums.map((album) => {
              const mine = photos.filter((p) => p.album_id === album.id);
              const live = mine.filter((p) => !p.removed_at).length;
              const hidden = mine.length - live;
              const open = openAlbum === album.id;

              return (
                <Fragment key={album.id}>
                  <tr>
                    <td>{album.title}</td>
                    <td>{formatPartialDate(album.year, album.month, album.day)}</td>
                    <td>
                      {live}
                      {hidden > 0 && <span className="badge">{hidden} hidden</span>}
                    </td>
                    <td>{eventTitle(album.event_id)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          aria-expanded={open}
                          onClick={() => setOpenAlbum(open ? null : album.id)}
                        >
                          {open ? 'Hide photos' : 'Photos'}
                        </button>
                        <button className="btn btn--ghost btn--small" type="button"
                          onClick={() => setDraft({
                            id: album.id,
                            slug: album.slug,
                            title: album.title,
                            event_id: album.event_id ?? '',
                            year: album.year ? String(album.year) : '',
                            month: album.month ? String(album.month) : '',
                            day: album.day ? String(album.day) : '',
                          })}>
                          Edit
                        </button>
                        <button className="btn btn--ghost btn--small" type="button"
                          onClick={() => removeAlbum(album)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={5}>
                        <PhotoList photos={mine} thumbnails={thumbnails} onToggle={setRemoved} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {albums.length === 0 && (
          <p className="muted">
            No albums yet. If you expected to see them, the content migration has not been run.
          </p>
        )}
      </section>
    </>
  );
}

function PhotoList({
  photos,
  thumbnails,
  onToggle,
}: {
  photos: Photo[];
  thumbnails: Record<string, string>;
  onToggle: (photo: Photo, removed: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (photos.length === 0) return <p className="muted">No photos in this album yet.</p>;

  async function toggle(photo: Photo) {
    setBusy(photo.id);
    await onToggle(photo, !photo.removed_at);
    setBusy(null);
  }

  return (
    <>
      <p className="hint">
        Taking a photo down removes it from the public gallery at the next rebuild. The image
        file itself stays in the site&rsquo;s repository history and cannot be erased, so this
        hides a photo rather than deleting it.
      </p>
      <ul className="photo-list">
        {photos.map((photo) => (
          <li key={photo.id} className={photo.removed_at ? 'is-removed' : undefined}>
            <div className="photo-list__item">
              {/* A row can outlive its file, so don't render an image with no source. */}
              {thumbnails[photo.file] ? (
                <img
                  className="photo-list__thumb"
                  src={thumbnails[photo.file]}
                  alt=""
                  width={48}
                  height={36}
                  loading="lazy"
                />
              ) : (
                <span className="photo-list__thumb" aria-hidden="true" />
              )}
              <div>
                <p className="photo-list__caption">{photo.caption || photo.file}</p>
                <p className="directory__meta">
                  {photo.removed_at ? 'Hidden from the gallery' : 'Live on the gallery'}
                </p>
              </div>
            </div>
            <button
              className="btn btn--ghost btn--small"
              type="button"
              disabled={busy === photo.id}
              onClick={() => toggle(photo)}
            >
              {photo.removed_at ? 'Put back' : 'Take down'}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Uploader({
  albums,
  member,
  onUploaded,
  onError,
}: {
  albums: Album[];
  member: Member;
  onUploaded: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [albumId, setAlbumId] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  async function upload() {
    if (!albumId || files.length === 0) return;
    setBusy(true);
    onError(null);

    const supabase = getSupabase();
    let done = 0;

    for (const file of files) {
      setProgress(`Uploading ${done + 1} of ${files.length}…`);

      // Keep the extension but never trust the rest of the name in a storage key.
      const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
      const path = `${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('uploads')
        .upload(path, file, { contentType: file.type || 'image/jpeg' });

      if (uploadError) {
        onError(`${file.name}: ${uploadError.message}`);
        break;
      }

      const { error: rowError } = await supabase.from('photo_uploads').insert({
        album_id: albumId,
        storage_path: path,
        caption: file.name.replace(/\.[^.]+$/, ''),
        uploaded_by: member.id,
      });

      if (rowError) {
        // The object is orphaned if this fails, so clean it up rather than leaving litter.
        await supabase.storage.from('uploads').remove([path]);
        onError(`${file.name}: ${rowError.message}`);
        break;
      }
      done++;
    }

    setBusy(false);
    setProgress('');
    setFiles([]);
    await onUploaded();
  }

  const tooBig = files.filter((f) => f.size > MAX_UPLOAD);

  return (
    <section className="panel">
      <h2>Add photos</h2>
      <p className="muted">
        Pick an album, choose the photos, and upload. They are resized to under 1&nbsp;MB and
        added to the site automatically — they will not appear on the gallery straight away.
      </p>

      <p className="notice notice--inline">
        <strong>Uploads are permanent.</strong> Photos are committed to this site&rsquo;s public
        code repository, which keeps every version of every file forever. Taking a photo down
        later removes it from the gallery, but it stays downloadable from the repository&rsquo;s
        history and cannot be fully erased. Only upload photos everyone pictured is happy to
        have public.
      </p>

      <div className="fields">
        <label>
          Album
          <select value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
            <option value="">Choose an album…</option>
            {albums.map((album) => (
              <option key={album.id} value={album.id}>{album.title}</option>
            ))}
          </select>
        </label>
        <label>
          Photos
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
      </div>

      {files.length > 0 && (
        <p className="hint">
          {files.length} file(s) selected
          {tooBig.length > 0 && ` — ${tooBig.length} over 25 MB and will be rejected`}
        </p>
      )}

      <button
        className="btn btn--primary"
        type="button"
        onClick={upload}
        disabled={busy || !albumId || files.length === 0 || tooBig.length > 0}
      >
        {busy ? progress || 'Uploading…' : 'Upload photos'}
      </button>

      {albums.length === 0 && (
        <p className="hint">Create an album first — every photo belongs to one.</p>
      )}
    </section>
  );
}
