// Family Property Transition — content for /sell-parents-house and the partner guide.
// Edit copy here; templates.mjs renders it. Videos: paste a YouTube ID into `id` once recorded.
import site from '../site.config.mjs';

const img = (id, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const family = {
  path: '/sell-parents-house',
  title: 'Selling a Parent’s House in Bakersfield & Kern County',
  description: `Parent downsizing, moving to senior living, or unable to keep up the house? Compare an as-is sale with a traditional listing — with licensed local help. Call ${site.phone}.`,
  image: img('photo-1570129477492-45c003edd2be'),
  headline: 'Not sure what to do with <em>your parent’s house?</em>',
  lead: 'Whether your parent is downsizing, moving into senior living, or simply can’t keep up with the property anymore, we’ll help you understand your options — including selling as-is or listing traditionally.',
  answer: `If a parent is moving out of a Kern County home, the family usually has two realistic paths: sell the house as-is (no repairs, no clean-out, flexible closing) or prepare it and list it on the open market for a potentially higher price. ${site.name} reviews the property and shows both options side by side so the family can choose. Only the owner or someone with legal authority — a power of attorney, trustee, or conservator — can sign a sale.`,

  // Video — Nathanael, 60–90 seconds. Leave id empty until uploaded; a placeholder renders instead.
  heroVideo: { id: '', title: `How ${site.agent} helps families with a parent’s house` },

  problems: [
    ['The house needs repairs', 'You don’t need to fix anything before talking with us. We’ll tell you whether repairs are worth doing — or not.'],
    ['Decades of belongings', 'You don’t need to empty the house before calling. Belongings can be sorted, sold, donated, or left behind.'],
    ['You live somewhere else', 'Much of the process can be handled by phone, text, email, and e-signature. We can be your eyes on the property.'],
    ['Timing is uncertain', 'A fast closing is possible, but it doesn’t have to happen right away. The move comes first; the house can follow.'],
  ],

  paths: {
    direct: {
      name: 'Sell as-is',
      rows: ['Minimal preparation', 'No repairs required', 'Belongings can stay', 'One walkthrough, no showings', 'Closing date you choose', 'Price reflects condition and convenience'],
    },
    listing: {
      name: 'Traditional listing',
      rows: ['Property prepared for market', 'Repairs may raise the price', 'House cleared before photos', 'Showings and open houses', 'Standard escrow timeline', 'Aims for full market value'],
    },
  },

  // Required disclosure: on a direct purchase Harbison is the buyer, not the family's agent.
  disclosure: `When ${site.name} buys a property directly, ${site.agent} is the buyer — not the family’s agent — and discloses his California real estate license (DRE #${site.dre}) in writing. Families are always welcome to have another relative, an attorney, or an independent agent review any offer before signing.`,

  timeline: [
    ['First conversation', 'A call or text about the house, the move, and who is involved. No paperwork.'],
    ['Property review', 'A walkthrough — with you, a relative, or remotely by video. We note condition, belongings, and repairs.'],
    ['Options side by side', 'An as-is number next to an estimated listing outcome, with costs and timelines for each.'],
    ['Family decides', 'Take the time you need. Talk it over with siblings, an attorney, or a fiduciary.'],
    ['Closing on your schedule', 'Escrow and title handle the transfer. Signatures can often be done remotely.'],
  ],

  // Four launch videos. Each doubles as an FAQ answer and a YouTube / Shorts asset.
  videos: [
    { id: '', q: 'What happens to the house when a parent moves into senior living?' },
    { id: '', q: 'Should we fix the house before selling it?' },
    { id: '', q: 'What if the house is still full of furniture and belongings?' },
    { id: '', q: 'How do I sell my parent’s Bakersfield home if I live in another state?' },
  ],

  faqs: [
    ['What happens to the house when a parent moves into senior living?', 'Nothing has to happen right away. Families usually choose between keeping it for a while, renting it, selling it as-is, or preparing it and listing it. The right answer depends on the home’s condition, what the move costs, and how quickly the family needs the proceeds. We lay out the as-is and listing numbers side by side.'],
    ['Should we fix the house before selling it?', 'Only if the repair is likely to return more than it costs and the family has the time and budget to manage it. Cosmetic work like paint and flooring sometimes pays; big items like a roof or foundation often don’t. We’ll tell you which repairs, if any, make sense.'],
    ['What if the house is still full of furniture and belongings?', 'You can talk to us before anything is moved. On an as-is sale, belongings you don’t want can stay. On a listing, we can point you to estate-sale and clean-out companies in Kern County.'],
    ['Can I sell my parent’s Bakersfield house if I live in another state?', 'Usually, yes. Walkthroughs can be done by video, documents are signed electronically, and escrow can arrange a mobile notary where one is required. Many families manage the entire sale from out of town.'],
    ['Who has to sign to sell a parent’s house?', 'The owner on title, or someone with legal authority to act for them — for example an agent under a durable power of attorney that covers real estate, a trustee of a living trust, or a court-appointed conservator. If you’re not sure who has authority, an elder-law or estate attorney can tell you. We can talk with any of them.'],
    ['Do we have to decide right away?', 'No. Requesting options costs nothing and creates no obligation. Many families take weeks or months, especially while a move is still being planned.'],
    ['How do we know an as-is offer is fair?', 'Compare it with the estimated listing result, minus repairs, commissions, carrying costs, and time. We show that math openly, and you’re welcome to have anyone you trust review it.'],
  ],

  helps: [
    'Compare selling as-is with listing',
    'Decide which repairs, if any, are worth it',
    'Belongings can stay on an as-is sale',
    'Manage the sale from out of town',
    'Work with POAs, trustees, and attorneys',
    `Licensed local agent — DRE #${site.dre}`,
  ],
};

// Multi-step form options. Values are stored verbatim in the CRM.
export const familyForm = {
  situations: [
    'Parent is downsizing',
    'Parent is moving to senior living',
    'Parent can’t maintain the home',
    'Inherited property',
    'Property is vacant',
    'Property needs repairs',
    'We live outside Bakersfield',
    'Something else',
  ],
  helpNeeded: [
    'Understand what the house is worth',
    'Compare an as-is offer with listing',
    'Sell quickly',
    'Figure out repairs',
    'Deal with belongings',
    'Not sure yet',
  ],
  relationships: [
    'I own the property',
    'My parent owns it',
    'I hold power of attorney',
    'Trustee',
    'Executor / administrator',
    'Conservator',
    'Other family member',
    'Professional helping the family',
  ],
  timelines: ['Within 30 days', '1–3 months', '3–6 months', 'Just exploring'],
  contactPrefs: ['Call', 'Text', 'Email'],
};

// Partner guide (printed / QR). Families get this from a senior move manager, estate-sale company, etc.
export const partnerGuide = {
  path: '/family-property-guide',
  title: 'Family Property Guide — What to Do With a Parent’s House',
  intro: 'A short guide for families in Kern County who are helping a parent move and aren’t sure what to do with the house.',
  questions: [
    'Who has legal authority to sign — the owner, a POA, a trustee, or a conservator?',
    'Does the house need to sell to pay for the move or care, or can it wait?',
    'Which belongings go with your parent, which go to family, and which can stay?',
    'Are any repairs worth doing, or would an as-is sale net close to the same?',
    'Who in the family will be the point of contact?',
  ],
};
