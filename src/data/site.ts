export const site = {
  name: 'Delta Chi Northeast Ohio Alumni Chapter',
  shortName: 'Delta Chi NEO',
  description:
    'The Northeast Ohio Alumni Chapter of The Delta Chi Fraternity — bringing together alumni from every Delta Chi chapter living in Northeast Ohio.',
  duesUrl:
    'https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=2YJ9N3B7TCKSG',
  chapterDues: 35,
  virtualDues: 15,
  charteredOn: 'October 25, 2016',
};

export const nav = [
  { label: 'About', href: '/about' },
  { label: 'Events', href: '/events' },
  { label: 'Membership', href: '/membership' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Awards', href: '/awards' },
  { label: 'Newsletters', href: '/newsletters' },
  { label: 'By-Laws', href: '/by-laws' },
];

export const social = [
  { label: 'Instagram', href: 'http://instagram.com/deltachi_neo' },
  { label: 'Facebook', href: 'https://www.facebook.com/groups/1073199839467980/' },
  { label: 'X / Twitter', href: 'http://www.twitter.com/deltachi_neo' },
  { label: 'Discord', href: 'https://discord.gg/D9h4eunx' },
];

export const resources = [
  { label: 'Delta Chi International', href: 'http://deltachi.org/' },
  { label: 'Delta Chi Educational Foundation', href: 'http://deltachi.org/dcef-home' },
  {
    label: 'MyDchi — update your contact info',
    href: 'https://my.omegafi.com/apps/myomegafi/public/login/index.php?apikey=990eb0adf826a757c234ed8d3b2d23b8',
  },
];

/** Officer letters and their duties, per Article II of the chapter by-laws. */
export const officerRoles: Record<string, string> = {
  A: 'President',
  B: 'Director of Programming',
  C: 'Secretary',
  D: 'Treasurer',
  E: 'Director of Membership',
};
