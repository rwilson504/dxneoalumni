-- ---------------------------------------------------------------------------
-- Strip links to the retired Wix site out of event descriptions.
--
-- These came across in the original content migration. The gallery they point at no
-- longer exists, and event cards now link to their own album instead, so the anchors
-- are both broken and redundant. The wording is kept, only the links go.
-- ---------------------------------------------------------------------------

-- Every one of the ten links points at the same URL with one of four link texts, so plain
-- replace() is used rather than a regex: exact, and no pattern semantics to get wrong.

-- "check out our pictures [here](...)" leaves a dangling "here" if only the link is
-- removed, so the whole clause goes.
update public.events
set description = replace(
  description,
  ' check out our pictures [here](https://dxneoalumni.wixsite.com/main/photo-gallery)',
  ''
)
where description like '%dxneoalumni.wixsite.com%';

-- The rest read fine as plain text: "See pictures in our Photo Gallery."
update public.events
set description = replace(
  replace(
    replace(
      description,
      '[Gallery](https://dxneoalumni.wixsite.com/main/photo-gallery)',
      'Gallery'
    ),
    '[Photo Gallery.](https://dxneoalumni.wixsite.com/main/photo-gallery)',
    'Photo Gallery.'
  ),
  '[photo gallery](https://dxneoalumni.wixsite.com/main/photo-gallery)',
  'photo gallery'
)
where description like '%dxneoalumni.wixsite.com%';
