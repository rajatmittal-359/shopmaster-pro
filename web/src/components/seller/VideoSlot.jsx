'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Film, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { youtubeId } from '@/lib/youtube';

/**
 * One short product video, optional.
 *
 * THE SHAPE, FROM THE REFERENCES (12 Sep 2026)
 *   Amazon's seller form has a separate "Upload video" slot beside the image
 *   slots, with the limits stated where you press. Flipkart's seller hub is
 *   the same. One clip, because a shop this size has no brand-registry tier
 *   and one good 20-second clip is the whole benefit (see Product.video).
 *
 * WHAT TRAVELS
 *   A data URL in the JSON body, the same road the photos use, capped at 7 MB
 *   here because the server's JSON limit is 10 MB and base64 adds a third.
 *   `null` tells the server to remove the stored clip; `undefined` leaves it.
 *
 * The value this edits: { existing: {url, poster} | null, next: dataUrl | null,
 * removed: boolean } - three states so the form can say exactly one of
 * "keep", "replace", "remove" when it saves.
 */
const MAX_BYTES = 7 * 1024 * 1024;

export default function VideoSlot({ value, onChange }) {
  const inputRef = useRef(null);
  // A local preview of a newly chosen file, released when the file changes.
  const preview = useMemo(() => (value.nextFile ? URL.createObjectURL(value.nextFile) : null), [value.nextFile]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const pick = (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error('That is not a video file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error(`That video is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 7 MB - about 20 seconds is plenty.`);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => onChange({ ...value, next: reader.result, nextFile: file, removed: false });
    reader.onerror = () => toast.error('Could not read that video.');
    reader.readAsDataURL(file);
  };

  const remove = () => {
    const before = value;
    onChange({ existing: value.existing, next: null, nextFile: null, removed: Boolean(value.existing) });
    toast('Video removed', {
      description: value.existing ? 'It goes when you save.' : undefined,
      action: { label: 'Undo', onClick: () => onChange(before) },
    });
  };

  const [link, setLink] = useState('');
  const applyLink = () => {
    const id = youtubeId(link);
    if (!id) {
      toast.error('That is not a YouTube video link. It should look like youtube.com/watch?v=… or youtu.be/…');
      return;
    }
    onChange({ ...value, next: link.trim(), nextFile: null, youtubeId: id, removed: false });
    setLink('');
  };

  const showing = value.next ? 'new' : value.existing && !value.removed ? 'existing' : 'none';
  const isLink = showing === 'new' ? Boolean(value.youtubeId) : Boolean(value.existing?.youtubeId);
  const linkPoster = showing === 'new' && value.youtubeId ? `https://i.ytimg.com/vi/${value.youtubeId}/hqdefault.jpg` : null;

  return (
    <div className="mt-4 rounded-lg border border-dashed p-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {showing === 'none' && (
        <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full items-center gap-3 rounded-md px-1 py-1 text-left text-sm hover:bg-accent/60"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-brand-ink">
            <Film className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Add a short video <span className="font-normal text-muted-foreground">(optional)</span></span>
            <span className="block text-xs text-muted-foreground">Under 7 MB, about 20 seconds. Shown beside the photos with a play button.</span>
          </span>
          <Upload className="size-4 text-muted-foreground" />
        </button>
        {/* Or a link: nothing to upload, no size limit, and a demo that already
            lives on the seller's YouTube stays there. */}
        <div className="mt-2 flex items-center gap-2 px-1">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="or paste a YouTube link (youtube.com / youtu.be / Shorts)"
            className="h-9 text-sm"
            aria-label="YouTube link"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={applyLink} disabled={!link.trim()}>
            Use link
          </Button>
        </div>
        </>
      )}

      {showing !== 'none' && (
        <div className="flex items-center gap-3">
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-black">
            {showing === 'new' && preview && !isLink && (
              <video src={preview} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            )}
            {linkPoster && <Image src={linkPoster} alt="" fill unoptimized className="object-cover" sizes="64px" />}
            {showing === 'existing' && value.existing.poster && (
              <Image src={value.existing.poster} alt="" fill unoptimized className="object-cover" sizes="64px" />
            )}
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-6 place-items-center rounded-full bg-white/90 text-foreground">
                <svg viewBox="0 0 20 20" className="ml-0.5 h-3 w-3" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
              </span>
            </span>
          </span>
          <span className="min-w-0 flex-1 text-sm">
            <span className="block font-medium">{showing === 'new' ? (isLink ? 'YouTube video - saved when you save' : 'New video - uploads when you save') : isLink ? 'YouTube video' : 'Product video'}</span>
            <span className="block text-xs text-muted-foreground">
              {showing === 'new' ? (isLink ? value.next : value.nextFile?.name) : 'Plays from the gallery with a tap.'}
            </span>
          </span>
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              Replace
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={remove} aria-label="Remove the video">
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
