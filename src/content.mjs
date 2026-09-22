// Page content. Plain data — edit copy here, templates handle layout.

const img = (id, w = 1400) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const images = {
  hero: img('photo-1600585154340-be6161a56a0c', 1800),
  home: img('photo-1600607687939-ce8a6c25118c', 900),
  list: img('photo-1600566753190-17f0baa2a6c3', 900),
  renovate: img('photo-1503387762-592deb58ef4e', 900),
  land: img('photo-1500530855697-b586d89ba3ee', 900),
  local: img('photo-1500534314209-a25ddb2bd429', 1200),
  street: img('photo-1568605114967-8130f3a36994'),
  classic: img('photo-1570129477492-45c003edd2be'),
  suburban: img('photo-1564013799919-ab600027ffc6'),
  valley: img('photo-1506744038136-46273834b3fb'),
};

export const situationOptions = [
  'Inherited property',
  'Needs major repairs',
  'Vacant property',
  'Problem tenants',
  'Relocation',
  'Life change (divorce, downsizing, etc.)',
  'Fire / water damage',
  'Unfinished remodel',
  'Land or development opportunity',
  'Something else',
];

export const timelineOptions = ['As soon as possible', 'Within 30 days', '1–3 months', '3+ months', 'Just exploring options'];

export const situations = [
  {
    slug: 'inherited-property',
    name: 'Inherited Property',
    title: 'Sell an Inherited House in Kern County',
    description: 'Inherited a house in Bakersfield, Tehachapi, or elsewhere in Kern County? Harbison helps heirs understand their options and sell as-is on a clear timeline.',
    headline: 'Inherited a house? <em>We can help you sort it out.</em>',
    lead: 'Inheriting a property often comes with more questions than answers — belongings to clear, repairs nobody has budgeted for, and family members who may not agree on what to do next.',
    image: images.classic,
    body: [
      'You do not need to have everything figured out before you call. We regularly look at homes that have sat untouched for months, still hold a lifetime of belongings, or need work the family is not in a position to take on.',
      'Depending on the property and your goals, a direct sale may be the simplest path. In other cases, a light clean-up and a traditional listing can net more. Our job is to lay out those options honestly so the family can decide together.',
      'If the estate is still going through probate, we can work alongside your attorney or executor and plan around the court timeline.',
    ],
    helps: [
      'Buy as-is — no need to clear out furniture or belongings',
      'Coordinate with executors, attorneys, and multiple heirs',
      'Flexible closing timed around probate or trust administration',
      'Honest comparison of a direct sale vs. listing',
    ],
    faqs: [
      ['Can I sell an inherited house that is still in probate?', 'Often, yes — but it depends on the estate and the court process. We can work with your executor or probate attorney so any sale is structured correctly and timed around required approvals.'],
      ['Do we have to clean out the house first?', 'No. If we buy the property directly, you can take what matters to the family and leave the rest.'],
    ],
  },
  {
    slug: 'needs-major-repairs',
    name: 'Needs Major Repairs',
    title: 'Sell a House That Needs Repairs As-Is',
    description: 'Roof, foundation, plumbing, or years of deferred maintenance? Sell your Kern County house as-is to Harbison — no repairs, no showings.',
    headline: 'Big repairs? <em>Sell it as-is.</em>',
    lead: 'Foundation cracks, a failing roof, old plumbing, outdated electrical — major repairs can make a traditional sale feel out of reach.',
    image: images.renovate,
    body: [
      'Many buyers using conventional loans cannot purchase homes with serious condition issues, and making the repairs yourself means paying up front, managing contractors, and waiting. That is time and money a lot of owners simply do not have.',
      'Harbison looks at the property the way a builder does: what it needs, what it will cost, and what it could be worth afterward. That lets us make a straightforward offer on the house exactly as it sits today.',
      'If a few targeted repairs would dramatically improve your result on the open market, we will tell you that too.',
    ],
    helps: [
      'No repairs, cleaning, or contractor coordination',
      'Construction-informed evaluation of the real repair scope',
      'No lender inspections or repair-request renegotiations',
      'Straight answer on whether repairs would pay off for you',
    ],
    faqs: [
      ['Will you still make an offer if the house has foundation or roof problems?', 'Yes. Condition issues are factored into the offer — you do not need to fix anything first.'],
      ['Do I need to disclose problems I know about?', 'Yes, California requires sellers to disclose known material issues. Being upfront also helps us give you an accurate offer faster.'],
    ],
  },
  {
    slug: 'vacant-property',
    name: 'Vacant Property',
    title: 'Sell a Vacant House or Property',
    description: 'A vacant house costs you in taxes, insurance, utilities, and risk. Harbison buys vacant properties across Kern County as-is.',
    headline: 'Empty house? <em>Stop paying to hold it.</em>',
    lead: 'A vacant property keeps costing money every month — taxes, insurance, utilities, maintenance — and empty homes can attract break-ins, squatters, and vandalism.',
    image: images.street,
    body: [
      'Whether the property has been empty for a few months or a few years, we can evaluate it quickly and give you a clear sense of what it is worth in its current condition.',
      'You do not need to live nearby. We can handle much of the process remotely and coordinate access to the property on your behalf.',
      'If the property has development or renovation upside, we will look at that as well — sometimes a vacant parcel or tired home is worth more than it appears.',
    ],
    helps: [
      'Fast evaluation — even if you are out of the area',
      'We handle access and walkthroughs',
      'Buy as-is, including overgrown or neglected properties',
      'Review of renovation or development upside',
    ],
    faqs: [
      ['I live out of state. Can I still sell?', 'Yes. Most of the process can be handled by phone, email, and electronic signatures, with closing through a local title or escrow company.'],
      ['What if there are squatters or break-in damage?', 'Let us know upfront. We buy properties in all kinds of situations and will factor that into the plan.'],
    ],
  },
  {
    slug: 'problem-tenants',
    name: 'Problem Tenants',
    title: 'Sell a Rental Property With Problem Tenants',
    description: 'Tired of being a landlord? Harbison buys Kern County rental properties with tenants in place — including difficult situations.',
    headline: 'Tired of being a landlord? <em>Let’s talk.</em>',
    lead: 'Late rent, property damage, and constant calls can turn a rental from an investment into a burden.',
    image: images.suburban,
    body: [
      'Selling a tenant-occupied property on the open market can be difficult: showings are hard to schedule, the unit may not show well, and many buyers want it delivered vacant.',
      'We can evaluate purchasing the property with tenants in place, subject to the lease and California tenant protection laws. That can let you step away without handling a turnover yourself.',
      'We will always work within the law and treat occupants respectfully — it protects everyone involved.',
    ],
    helps: [
      'Purchase with tenants in place (subject to lease terms)',
      'No showings that disrupt occupants',
      'Buy as-is, including tenant-caused damage',
      'Works for single-family, duplexes, and small multifamily',
    ],
    faqs: [
      ['Do my tenants have to move out before I sell?', 'Not necessarily. We can often buy with tenants in place. Existing leases and California tenant protections carry over to the new owner.'],
      ['Should I talk to a lawyer about my tenant situation?', 'For evictions or lease disputes, yes — a landlord-tenant attorney is the right resource. We are happy to coordinate with them on timing.'],
    ],
  },
  {
    slug: 'relocation',
    name: 'Relocation',
    title: 'Relocating? Sell Your Kern County House Fast',
    description: 'Moving for work, family, or a fresh start? Harbison buys houses in Bakersfield and Kern County on your timeline so you can move without carrying two homes.',
    headline: 'Moving on? <em>Close on your timeline.</em>',
    lead: 'A new job or family move rarely waits for the perfect listing season. Carrying two housing payments — or managing a sale from far away — adds real stress.',
    image: images.home,
    body: [
      'We can set a closing date that matches your move, whether that means closing quickly or giving you extra time before you hand over the keys.',
      'Because we buy as-is, there is no need to stage the home, keep it show-ready, or schedule repairs while you are packing.',
      'If you have more time and want maximum market exposure, we will tell you whether a traditional listing makes more sense.',
    ],
    helps: [
      'Pick your closing date',
      'No staging, showings, or repairs',
      'Leave behind items you do not want to move',
      'Remote-friendly process with electronic signing',
    ],
    faqs: [
      ['Can I stay in the house for a bit after closing?', 'In many cases we can work out a short post-closing occupancy period. Just tell us what you need.'],
      ['How quickly can you close?', 'It depends on title and escrow, but a direct purchase can often close in a matter of weeks rather than months.'],
    ],
  },
  {
    slug: 'life-change',
    name: 'Life Change',
    title: 'Selling a House During Divorce, Downsizing, or a Life Change',
    description: 'Divorce, downsizing, health changes, or retirement — Harbison offers a calm, simple way to sell a Kern County property when life shifts.',
    headline: 'Life changed? <em>Your next step can be simple.</em>',
    lead: 'Divorce, downsizing, a health change, retirement, or a growing family — big life changes often mean the house needs to change too.',
    image: images.valley,
    body: [
      'These moments are stressful enough without a drawn-out sale. We keep the process clear and respectful, with no pressure to decide before you are ready.',
      'When more than one owner is involved, we can communicate with both parties and their representatives so everyone sees the same information.',
      'For some families, a direct sale is the cleanest option. For others, listing or a short renovation is better. We will walk through both.',
    ],
    helps: [
      'Clear, no-pressure conversations',
      'Work with co-owners, attorneys, and mediators',
      'Flexible timing around your transition',
      'Sell as-is, including belongings you no longer need',
    ],
    faqs: [
      ['Both owners need to agree to sell, right?', 'Generally, yes — all owners on title must sign. We can share information with both parties so the decision is transparent.'],
      ['Is there any obligation if I request an offer?', 'None. You can review your options and decide not to move forward at any time.'],
    ],
  },
  {
    slug: 'fire-water-damage',
    name: 'Fire / Water Damage',
    title: 'Sell a Fire- or Water-Damaged House As-Is',
    description: 'Fire, smoke, flood, or water damage? Harbison buys damaged houses across Kern County as-is — no restoration required.',
    headline: 'Fire or water damage? <em>You still have options.</em>',
    lead: 'After a fire, leak, or flood, owners face restoration bids, insurance claims, and a house that may not be livable.',
    image: images.renovate,
    body: [
      'Restoring a damaged home can take months and often costs more than expected. Many owners would rather settle their insurance claim and move on.',
      'We evaluate damaged properties as they sit, including homes with smoke damage, mold concerns from water intrusion, or structural damage.',
      'We can work around your insurance timeline. Talk with your insurer or adjuster about how a sale affects your claim before you commit to anything.',
    ],
    helps: [
      'Buy as-is — no restoration or clean-up',
      'Construction-informed evaluation of the damage',
      'Timing coordinated around insurance claims',
      'Clear numbers so you can compare against rebuilding',
    ],
    faqs: [
      ['Can I sell before my insurance claim is settled?', 'Possibly, but how a sale affects your claim depends on your policy. Check with your insurer or a public adjuster first — we will plan around their answer.'],
      ['Do you buy houses that are unlivable?', 'Yes. We regularly look at properties that are not currently habitable.'],
    ],
  },
  {
    slug: 'unfinished-remodel',
    name: 'Unfinished Remodel',
    title: 'Sell a House With an Unfinished Remodel',
    description: 'Stalled renovation, open permits, or a contractor who walked away? Harbison buys Kern County homes with unfinished remodels.',
    headline: 'Remodel stalled? <em>We can take it from here.</em>',
    lead: 'A project that ran over budget, a contractor who disappeared, or permits that never closed out — unfinished remodels are hard to sell and expensive to finish.',
    image: images.renovate,
    body: [
      'Half-finished kitchens, open walls, and missing permits scare off most retail buyers and many lenders.',
      'Harbison’s construction perspective means we can size up what is left to do — including permit status — and make an offer that accounts for it.',
      'If finishing a few key items would change your outcome significantly, we will walk you through that option too.',
    ],
    helps: [
      'Buy mid-project, as-is',
      'Evaluate open or unpermitted work',
      'No need to hire another contractor',
      'Clear comparison: finish and list vs. sell now',
    ],
    faqs: [
      ['What about work that was done without permits?', 'Tell us what you know. Unpermitted work affects value and next steps, but it does not automatically prevent a sale.'],
      ['Can I leave the materials that are on site?', 'Usually, yes. Leftover materials and fixtures can often stay with the property.'],
    ],
  },
];

export const areas = [
  {
    slug: 'bakersfield',
    name: 'Bakersfield',
    title: 'Sell My House Fast in Bakersfield, CA',
    description: 'Sell your Bakersfield house as-is — no repairs, no showings. Harbison Buys Homes reviews every option: direct sale, listing, renovation, or development.',
    headline: 'Sell your Bakersfield house <em>on your terms.</em>',
    lead: 'From East Bakersfield and Oildale to Rosedale and the Southwest, we look at Bakersfield properties in every condition and price range.',
    image: images.street,
    body: [
      'Bakersfield’s housing stock ranges from older homes near downtown to newer subdivisions on the edges of town. Each part of the city has its own buyers, price points, and repair expectations — and that affects which path makes the most sense for you.',
      'We are local, which means we can see the property in person, understand its neighborhood, and give you a practical answer quickly.',
    ],
    places: ['Downtown', 'East Bakersfield', 'Oildale', 'Rosedale', 'Southwest', 'Northwest', 'Seven Oaks', 'Lamont'],
  },
  {
    slug: 'tehachapi',
    name: 'Tehachapi',
    title: 'Sell My House Fast in Tehachapi, CA',
    description: 'Selling a house or land in Tehachapi, Golden Hills, Bear Valley Springs, or Stallion Springs? Harbison buys as-is and reviews every option.',
    headline: 'Tehachapi homes & land. <em>Real options.</em>',
    lead: 'Mountain homes, cabins, acreage, and in-town properties — Tehachapi-area real estate is varied, and so are the right exit strategies.',
    image: images.valley,
    body: [
      'Properties in Golden Hills, Bear Valley Springs, Stallion Springs, and the surrounding areas can be harder to value than typical tract homes. Wells, septic, access roads, and acreage all play a role.',
      'We look at the whole picture — including land and development potential — and give you a straightforward read on your options.',
    ],
    places: ['Tehachapi', 'Golden Hills', 'Bear Valley Springs', 'Stallion Springs', 'Alpine Forest', 'Sand Canyon'],
  },
  {
    slug: 'kern-county',
    name: 'Kern County',
    title: 'We Buy Houses Throughout Kern County, CA',
    description: 'Harbison Buys Homes buys houses and land throughout Kern County — Bakersfield, Tehachapi, Delano, Shafter, Wasco, Taft, Arvin, Ridgecrest, and more.',
    headline: 'Kern County properties. <em>Local judgment.</em>',
    lead: 'We review houses, rentals, and land across Kern County — from the valley floor to the mountains and the desert.',
    image: images.land,
    body: [
      'Whether your property is in a smaller community or on a rural parcel, we can evaluate it and give you a clear, honest set of options.',
      'Not sure if your location qualifies? Send the address. If it is not a fit for us, we will tell you quickly.',
    ],
    places: ['Arvin', 'Delano', 'Lamont', 'McFarland', 'Shafter', 'Wasco', 'Taft', 'Ridgecrest', 'Lake Isabella', 'California City'],
  },
];

export const faqs = [
  ['How do you determine an offer?', 'We look at the property’s location, condition, estimated repair costs, and what similar homes nearby have sold for. We will walk you through how we got to the number.'],
  ['Do I have to make any repairs or clean the house?', 'No. If we buy directly, we buy as-is. Take what you want and leave the rest.'],
  ['Are there fees or commissions?', 'On a direct sale to Harbison, you do not pay a real estate commission to us. Typical closing costs are handled through a licensed title or escrow company, and we will explain who pays what before you sign anything.'],
  ['How fast can you close?', 'It depends on title and your needs. A direct sale can often close in a few weeks, or later if you need more time.'],
  ['Am I obligated to accept an offer?', 'Never. Requesting options is free and there is no obligation.'],
  ['What if selling to you is not my best option?', 'Then we will say so. Sometimes listing on the market, renovating, or a development approach produces a better result — our goal is to find the right path, not force one.'],
];
