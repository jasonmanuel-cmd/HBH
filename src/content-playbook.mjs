// Content from the CallHarbison.com Site Development Playbook and the Phase 1 HomeVestors research.
// Rules carried over from those documents: no guarantees of price or speed, no fake urgency or competing
// offers, explain the direct-sale discount, and show every realistic path — not just a cash offer.
import site from '../site.config.mjs';
import { images } from './content.mjs';

export const supportingPromise = 'Clear options for complicated properties and complicated situations.';

export const heroCopy = {
  eyebrow: 'Bakersfield • Tehachapi • Kern County',
  sub: 'Whether your property needs repairs, has tenants, was inherited, is vacant, or needs to be sold on a different timeline, we help you compare the clearest path forward.',
  trust: [
    ['As-is review', 'No repairs to start'],
    ['Direct sale or other paths', 'Not just a cash offer'],
    ['Local and licensed', `DRE #${site.dre}`],
    ['No obligation', 'You decide'],
  ],
};

export const reassurance = [
  'No repairs required to start',
  'No showings required for a direct sale',
  'Clear written next steps',
  'No obligation to accept an offer',
];

export const processSteps = [
  ['Tell us the address.', `Use the form or call or text ${site.phone}. That’s all we need to start.`],
  ['We review the property and situation.', 'Condition, timeline, occupancy, and what you want out of the sale — in person or by video.'],
  ['You compare your options.', 'A direct offer if it fits, and a listing, repair, or development path when those are realistic — in writing, with the assumptions.'],
  ['You decide what comes next.', 'Take the time you need. Talk it over with family or an advisor. There is no obligation.'],
];

// The five paths. `route` is stored on the lead as route_interest.
export const routes = [
  { route: 'direct', name: 'Sell Direct', text: 'Get a written as-is offer and choose your closing date. No repairs, cleaning, or showings.', image: 'home', alt: 'Single-family home exterior' },
  { route: 'listing', name: 'List on the Market', text: 'If retail exposure is likely to net more, our licensed agent can list the property instead.', image: 'list', alt: 'Bright living room prepared for listing' },
  { route: 'renovate', name: 'Renovate Then Sell', text: 'A few targeted repairs can change the outcome. We estimate which ones are worth doing — and which are not.', image: 'renovate', alt: 'Contractor reviewing renovation plans' },
  { route: 'development', name: 'Explore Development', text: 'Some lots are worth more for what could be built. We review zoning, access, and utilities.', image: 'land', alt: 'Open land with development potential' },
  { route: 'not_ready', name: 'Not Ready Yet', text: 'Get the information now and decide later. We follow up only as often as you ask us to.', image: 'valley', alt: 'Kern County valley landscape' },
];

export const compareDisclosure = 'A direct offer may be lower than the price a property could achieve after repairs, marketing, showings, negotiation, and a traditional sale. A direct sale may provide convenience, speed, reduced preparation, and more control over timing.';

export const whyHarbison = [
  ['Local Kern County knowledge', 'Bakersfield, Tehachapi, California City, Stallion Springs, and the communities around them.'],
  ['California-licensed REALTOR®', `${site.agent}, DRE #${site.dre}, with ${site.brokerage}.`],
  ['Construction and remodeling perspective', 'Repair scope is estimated the way a builder sees it, not guessed.'],
  ['Direct acquisition capability', 'When a direct sale fits, Harbison can be the buyer.'],
  ['Listing and development perspective', 'When it doesn’t, the same team can list, plan repairs, or review development potential.'],
  ['Clear options, not one forced solution', 'You see the paths side by side and choose.'],
];

export const transparency = [
  'You can compare a direct sale with listing.',
  'You can take time to consult family or advisors.',
  'You are not required to accept an offer.',
  'We explain the assumptions behind an offer.',
  'We do not use fake deadlines or fake competing offers.',
  'Closing occurs through a licensed title or escrow company.',
  'We will tell you if another path appears to fit better.',
];

// Seller safeguards (from the Phase 1 research, section 9.2). Published on /how-it-works.
export const safeguards = [
  ['A written explanation before you sign', 'Every offer comes with the value range, repair scope, costs, and closing terms it is based on.'],
  ['Independent advice is welcome', 'Especially for inherited, divorce, guardianship, or high-equity situations, we encourage you to have family, an attorney, or another agent review anything before signing.'],
  ['Authority is confirmed first', 'We confirm who can legally sign — owners, heirs, trustees, or someone holding power of attorney — before any agreement.'],
  ['We pause when something is unclear', 'If anyone involved seems confused or pressured, we stop and make sure everyone understands before going further.'],
  ['No pressure tactics', 'No same-day signing demands, fake deadlines, invented competing buyers, or threats about what a city or lender will do.'],
  ['Our role is stated plainly', `On a direct purchase, Harbison is the buyer — not your agent — and ${site.agent}’s license status is disclosed in writing.`],
  ['“Stop” means stop', 'Ask us not to call or text and we will stop, immediately.'],
];

export const offerExplanation = 'A direct purchase price reflects the property’s condition, expected repairs, transaction costs, financing, holding time, resale risk, and the convenience of selling without preparing and marketing the property. A traditional listing may produce a higher gross price, but may require repairs, showings, time, commissions, and uncertainty.';

// Illustrative only — not a formula, a comp, or a promise.
export const offerExample = [
  ['Estimated value after repairs', '$320,000'],
  ['Repairs (roof, kitchen, flooring, paint)', '−$30,000'],
  ['Costs to resell (commissions, escrow, transfer tax)', '−$22,000'],
  ['Holding and financing during work (about 4 months)', '−$10,000'],
  ['Costs to buy (escrow, title, inspections)', '−$3,000'],
  ['Contingency for surprises, plus buyer margin', '−$35,000'],
  ['Illustrative direct offer', '≈ $220,000'],
];

export const walkthrough = [
  'A walkthrough is one visit — in person or by video — with you or whoever you choose to have there.',
  'We look at the roof, foundation, plumbing, electrical, HVAC, kitchens, baths, and anything you already know needs work. We ask before taking photos.',
  'Most of the time is spent listening: what outcome you want, your timeline, and what matters most.',
  'You do not need to clean, repair, or empty anything first.',
];

// ---------- Stepped options form ----------
export const formSituations = [
  'I may want to sell directly',
  'The property needs major repairs',
  'I inherited the property',
  'The property is vacant',
  'There are tenant or rental issues',
  'I am relocating or facing a deadline',
  'I am considering listing',
  'I am unsure what to do',
  'Other',
];

// Situation page → preselected answer (the form then opens on the address step).
export const situationFormMap = {
  'inherited-property': 'I inherited the property',
  'needs-major-repairs': 'The property needs major repairs',
  'fire-water-damage': 'The property needs major repairs',
  'unfinished-remodel': 'The property needs major repairs',
  'vacant-property': 'The property is vacant',
  'problem-tenants': 'There are tenant or rental issues',
  'sell-rental-property': 'There are tenant or rental issues',
  relocation: 'I am relocating or facing a deadline',
  'life-change': 'I am unsure what to do',
  'failed-listing': 'I am considering listing',
  'land-development': 'Other',
};

// Optional follow-up questions on the thank-you page (the lead already exists by then).
export const detailOptions = {
  timeline: ['As soon as possible', 'Within 30 days', 'Within 1–3 months', 'More than 3 months', 'Just researching', 'Unsure'],
  occupancy: ['Owner occupied', 'Tenant occupied', 'Vacant', 'Family member or other occupant', 'Unsure'],
  condition: ['Move-in ready', 'Cosmetic updates needed', 'Major repairs needed', 'Fire or water damage', 'Unfinished construction/remodel', 'Hoarding or contents', 'Code or permit concern', 'Unsure'],
  outcome: ['Sell directly', 'Sell for the highest potential price', 'Avoid repairs', 'Close on a specific date', 'Compare my options', 'Keep the property if possible', 'Unsure'],
};

// ---------- New situation pages ----------
export const newSituations = [
  {
    slug: 'sell-rental-property',
    answer: 'You can sell a Kern County rental property whether it is occupied or vacant. Harbison reviews single-family rentals, duplexes, and small multifamily properties as-is, compares a direct sale with a listing to investors or owner-occupants, and works within existing leases and California tenant protections.',
    name: 'Sell a Rental Property',
    title: 'Sell a Rental Property in Kern County',
    description: 'Selling a rental in Bakersfield or Kern County? Compare a direct as-is sale with listing to investors — occupied or vacant, with leases handled through escrow.',
    headline: 'Ready to stop being a landlord? <em>Compare your exits.</em>',
    lead: 'Whether the property is performing, half-vacant, or needs work, selling a rental involves leases, tenants, deposits, and taxes that a typical home sale doesn’t.',
    image: images.suburban,
    body: [
      'We look at the property the way both an investor and an owner-occupant would, so you can see which buyer is likely to pay more: a direct sale to Harbison, a listing marketed to investors, or a listing after the tenants move out.',
      'Leases, security deposits, and rent prorations transfer through escrow. Selling with tenants in place is common; delivering the property vacant depends on the lease and on California law, including the just-cause rules that apply to many tenancies.',
      'Selling investment property can have tax consequences, such as depreciation recapture, and some owners use a 1031 exchange. Talk with a CPA before you sell — we can work around the timeline they recommend.',
    ],
    helps: [
      'Occupied or vacant — no turnover required',
      'Single-family, duplex, and small multifamily',
      'Lease and rent review',
      'Direct sale or listing to investors',
      'Timing coordinated with your CPA or 1031 plan',
    ],
    faqs: [
      ['Can I sell a rental property with tenants living in it?', 'Yes. Existing leases transfer to the buyer along with security deposits and prorated rent. Tenants must receive proper written notice before any walkthrough.'],
      ['Should I sell to an investor or wait until the tenants leave?', 'It depends on the lease, the rent compared with market rent, and the property’s condition. A vacant home can appeal to owner-occupants, who sometimes pay more, but a vacancy costs rent and time. We run both scenarios.'],
    ],
  },
  {
    slug: 'failed-listing',
    answer: 'If your Kern County listing expired or was withdrawn without selling, you can relist with a new price and preparation plan, sell directly as-is, or wait. Harbison looks at why it did not sell — price, condition, access, or financing — and compares a relaunch with a direct sale so you can choose.',
    name: 'Listing Didn’t Sell',
    title: 'House Didn’t Sell? Options After an Expired Listing',
    description: 'Listing expired or withdrawn in Bakersfield or Kern County? Find out why it didn’t sell and compare a relaunch with a direct as-is sale.',
    headline: 'Listing didn’t sell? <em>Let’s find out why.</em>',
    lead: 'An expired or withdrawn listing is frustrating, and it usually has a specific cause: price, condition, photos, access for showings, or buyer financing.',
    image: images.list,
    body: [
      'Before deciding anything, it helps to understand what the market told you. How many showings did the home get? Did offers fall apart on inspection or appraisal? Those answers point to different fixes.',
      'Sometimes a relaunch with a new price, targeted repairs, or better presentation is the right move. Sometimes the property’s condition means most financed buyers cannot close, and a direct as-is sale makes more sense.',
      'If your listing agreement is still active, we will not interfere with it. We can talk once it has expired or been withdrawn — or you are welcome to share this page with your current agent.',
    ],
    helps: [
      'Review of showing and offer history',
      'Relaunch plan and direct sale, side by side',
      'As-is purchase if financing kept falling through',
      `Licensed agent for a relisting — DRE #${site.dre}`,
    ],
    faqs: [
      ['Why didn’t my house sell?', 'The most common reasons are price relative to condition, limited access for showings, weak photos or marketing, and buyer financing that failed on inspection or appraisal. The showing and offer history usually points to the cause.'],
      ['Can you talk with me while my house is still listed?', 'We respect active listing agreements. If your home is listed with another agent, please talk with them first; we can review options once the listing has expired or been withdrawn.'],
    ],
  },
  {
    slug: 'land-development',
    answer: 'Harbison reviews vacant land, acreage, and homes on large lots that may be worth more for their development potential in Bakersfield, Tehachapi, California City, and across Kern County. We look at zoning, access, utilities, and lot size, then compare selling as-is, improving or splitting the parcel, and listing it.',
    name: 'Land & Development',
    title: 'Sell Land or a Development Property in Kern County',
    description: 'Selling vacant land, acreage, or a large lot in Kern County? Harbison reviews zoning, access, utilities, and development potential before you decide.',
    headline: 'Land or a big lot? <em>See what it could be.</em>',
    lead: 'Sometimes a property’s value is less about the house and more about the land underneath it — its zoning, size, access, and utilities.',
    image: images.land,
    body: [
      'Land is valued differently from houses. Zoning, road access, distance to water, sewer, and power, slope, and whether a parcel can legally be split all change what a buyer will pay.',
      'With construction and development perspective, we can tell you whether a parcel looks like a candidate for a lot split, new construction, or additional units — or whether a straightforward sale is the better path. Any development plan depends on city or county approval.',
      'We look at vacant parcels, acreage, infill lots, and older homes on oversized lots across the valley, mountain, and desert areas of Kern County.',
    ],
    helps: [
      'Zoning, access, and utility review',
      'Lot-split and new-construction potential',
      'Vacant land, acreage, and oversized lots',
      'Direct purchase or listing to builders',
    ],
    faqs: [
      ['How is land valued?', 'Mostly by what can be built on it: zoning, usable size, road access, and how close water, sewer, and power are. Two parcels with the same acreage can differ greatly in value.'],
      ['Can I split my lot?', 'Possibly. California’s SB 9 allows some single-family lots to be split, and local zoning sets other options. Eligibility depends on the parcel and on city or county rules, so it takes a property-specific review.'],
    ],
  },
];

export const stallionSprings = {
  slug: 'stallion-springs',
  geo: [35.0886, -118.6426],
  answer: 'Harbison Buys Homes buys and helps sell homes and land in Stallion Springs, in the Tehachapi Mountains west of Tehachapi. Harbison reviews as-is condition, lot size, access, and utilities, and compares a direct sale with listing or improving the property first.',
  name: 'Stallion Springs',
  title: 'Sell Your House or Land in Stallion Springs, CA',
  description: 'Selling a home or lot in Stallion Springs? Harbison Buys Homes reviews mountain properties as-is and compares a direct sale with listing.',
  headline: 'Stallion Springs homes &amp; land. <em>Clear options.</em>',
  lead: 'Stallion Springs sits in the Tehachapi Mountains west of Tehachapi, with custom homes, larger lots, and vacant parcels that each call for a different approach.',
  image: images.valley,
  body: [
    'Mountain properties can be harder to price than homes in town. Lot size, views, road access, slope, and the condition of custom features all matter, and there are fewer recent sales to compare against.',
    `${site.agent} works in Stallion Springs and the surrounding Tehachapi-area communities, so we can review a house or parcel in person and lay out whether a direct sale, a listing, or improving the property first makes the most sense.`,
    'We also look at vacant lots, including parcels owned by out-of-area sellers who have not seen the property in years.',
  ],
  places: ['Stallion Springs', 'Cummings Valley', 'Bear Valley Springs', 'Tehachapi', 'Golden Hills'],
};

const updated = '2026-09-24';

// Guide additions. `meaning` feeds the "What this means for your property" block.
export const newGuides = [
  {
    slug: 'renovate-or-sell-as-is',
    title: 'Should I Renovate Before Selling or Sell As-Is?',
    short: 'Renovate or Sell As-Is?',
    description: 'Which repairs pay off before selling, the three numbers to compare, the hidden costs of renovating, and when selling as-is makes more sense.',
    image: images.renovate,
    updated,
    answer: 'Renovate before selling only when a repair is likely to add more to the sale price than it costs, and you have the time and cash to manage it. Cosmetic updates like paint, flooring, and fixtures pay off more often than major systems. When a house needs a roof, foundation work, or a full remodel, selling as-is often nets about the same with far less risk.',
    meaning: 'Get two numbers before you spend anything: what the house is worth as-is, and what it would sell for after specific repairs. If the gap is not clearly bigger than the all-in cost of the work, renovating adds risk without adding money.',
    sections: [
      ['Which repairs usually pay off?', [
        'Buyers pay for what they can see and for what their lender requires. Fresh paint, flooring, lighting, yard cleanup, and fixing obvious defects often return a good share of their cost.',
        'Big-ticket items — roofs, foundations, HVAC, sewer lines — tend to be expected rather than rewarded. Fixing them prevents a lower price more often than it raises the price.',
      ]],
      ['The three numbers to compare', [
        '<ul><li><strong>As-is value</strong> — what the home sells for today, in its current condition.</li><li><strong>After-repair value</strong> — what it would sell for once updated.</li><li><strong>All-in renovation cost</strong> — materials, labor, permits, a contingency (10–20% is common), plus the mortgage, taxes, insurance, and utilities you carry while the work happens.</li></ul>',
      ]],
      ['The hidden costs of renovating to sell', [
        '<ul><li>Contractor availability and delays</li><li>Permit timelines and inspections</li><li>Surprises behind the walls — old wiring, plumbing, or water damage</li><li>Months of holding costs</li><li>Your own time managing the project</li></ul>',
      ]],
      ['When selling as-is makes more sense', [
        '<ul><li>The house needs major systems or structural work</li><li>You do not have the cash or time to run a project</li><li>You live outside the area</li><li>The property is inherited and several people must agree on spending</li></ul>',
      ]],
      ['A middle path: targeted repairs', [
        'Many homes land in between. A short list of high-return fixes done before listing can widen the buyer pool without a full remodel. With a construction perspective, Harbison can help you decide which items belong on that list — and which do not.',
      ]],
    ],
    related: ['needs-major-repairs', 'unfinished-remodel', 'failed-listing'],
  },
  {
    slug: 'what-affects-a-cash-offer',
    title: 'What Affects a Cash Offer on a House?',
    short: 'What Affects a Cash Offer?',
    description: 'How cash offers are calculated, what raises or lowers them, why they are usually below retail, and the questions to ask any cash buyer.',
    image: images.home,
    updated,
    answer: 'A cash offer starts with what the house should sell for after repairs, then subtracts the cost of those repairs, the buyer’s costs to buy, hold, finance, and resell, and a margin for risk. Condition, location, title issues, occupancy, and your closing timeline all move the number. A fair buyer should be able to show you each assumption.',
    meaning: 'Ask for the assumptions, not just the number. If a buyer cannot tell you the value range, repair scope, and costs behind an offer, you cannot tell whether it is fair — or compare it with listing.',
    sections: [
      ['The basic math', [
        'The example below is illustrative only — not a formula Harbison uses on every property, and not a promise about any home.',
        '<div class="compare-wrap"><table class="compare offer-table"><thead><tr><th scope="col">Line item</th><th scope="col">Example</th></tr></thead><tbody><tr><th scope="row">Estimated value after repairs</th><td>$320,000</td></tr><tr><th scope="row">Repairs</th><td>−$30,000</td></tr><tr><th scope="row">Costs to resell</th><td>−$22,000</td></tr><tr><th scope="row">Holding and financing</th><td>−$10,000</td></tr><tr><th scope="row">Costs to buy</th><td>−$3,000</td></tr><tr><th scope="row">Contingency and buyer margin</th><td>−$35,000</td></tr><tr><th scope="row">Illustrative offer</th><td><strong>≈ $220,000</strong></td></tr></tbody></table></div>',
      ]],
      ['What raises or lowers an offer', [
        '<ul><li>Condition and the size of the repair scope</li><li>The after-repair value supported by nearby sales</li><li>Location and buyer demand</li><li>Occupancy — tenants, family members, or contents left behind</li><li>Title issues, liens, or unpermitted work</li><li>How soon you need to close</li><li>Property type — land and multi-unit properties are valued differently</li></ul>',
      ]],
      ['Why a cash offer is usually below retail', [
        'A direct buyer takes on the repairs, the carrying costs, and the risk of reselling. In exchange, you skip preparation, showings, lender inspections, and the uncertainty of a financed sale. The discount is the price of that convenience and certainty — which is why it should be explained, not hidden.',
      ]],
      ['Questions to ask any cash buyer', [
        '<ul><li>Are you the buyer, or will you assign the contract to someone else?</li><li>What value and repair assumptions is the offer based on?</li><li>Is the price firm after the walkthrough, and what could change it?</li><li>Who pays closing costs, and which title or escrow company will handle closing?</li><li>What happens to the deposit if either side cancels?</li><li>Can I take time to review this with family or an advisor?</li></ul>',
      ]],
      ['How Harbison presents offers', [
        'We put the offer in writing with the assumptions behind it — the estimated value range, repair scope, costs, and closing options — and we show how it compares with listing when that is a realistic path. There are no deadlines designed to pressure you and no invented competing offers.',
      ]],
    ],
    related: ['needs-major-repairs', 'vacant-property', 'inherited-property'],
  },
  {
    slug: 'direct-sale-walkthrough',
    title: 'What Happens During a Direct-Sale Walkthrough?',
    short: 'The Direct-Sale Walkthrough',
    description: 'What to expect before, during, and after a direct-sale walkthrough in Kern County — and the red flags to watch for with any buyer.',
    image: images.classic,
    updated,
    answer: 'A direct-sale walkthrough is a single visit — in person or by video — where the buyer looks at the property’s condition, asks about your goals and timeline, and notes repairs. You do not need to clean or repair anything first. Afterward, you should receive a written explanation of your options, not a demand to sign on the spot.',
    meaning: 'The walkthrough is information-gathering for both sides. You should leave it knowing what happens next and when, and you should never feel you have to decide that day.',
    sections: [
      ['Before the visit', [
        '<ul><li>Confirm who owns the property and who should be there — co-owners, heirs, or someone with power of attorney.</li><li>If tenants live there, they must receive proper written notice before the visit.</li><li>Gather anything helpful: repair records, permits, HOA details, a mortgage payoff estimate.</li><li>No cleaning or staging required.</li></ul>',
      ]],
      ['During the visit', [
        'We walk the property with you and note the roof, foundation, plumbing, electrical, HVAC, kitchens, baths, and anything you already know needs work. We ask before taking photos. Most of the time is spent listening: what outcome you want, your timeline, and what matters most.',
      ]],
      ['After the visit', [
        'You receive your options in writing — a direct offer if it fits, and a listing or repair comparison when that is realistic — with the assumptions behind the numbers. Take the time you need; you can review it with family, an attorney, or another agent.',
      ]],
      ['Red flags at any walkthrough', [
        '<ul><li>Pressure to sign the same day</li><li>A price that changes without a clear reason</li><li>Claims that the city, a lender, or another buyer will take the property unless you act now</li><li>Vague answers about who the actual buyer is</li><li>Discouraging you from getting independent advice</li></ul>',
      ]],
    ],
    related: ['inherited-property', 'life-change', 'problem-tenants'],
  },
];

// "What this means for your property" for the original three guides.
export const guideMeaning = {
  'sell-house-as-is-california': 'Selling as-is removes the repair work, not the paperwork. Before you compare offers, list what you know about the property’s condition — it speeds up disclosures and makes every offer more accurate.',
  'cash-offer-vs-listing': 'Run both numbers for your house: a written as-is offer and a realistic listing net after repairs, commissions, and months of holding costs. Then weigh the gap against how much time, money, and uncertainty you can take on.',
  'sell-inherited-house-california': 'Start by confirming who has authority to sell — trustee, executor, or the heirs on title. Once that is clear, you can compare selling as-is, cleaning up and listing, renting, or keeping the home without losing time.',
};
