// Additional Kern County community pages. Facts are kept general and checkable; each page asks the owner
// to confirm city vs. county jurisdiction before relying on a zoning or permit assumption.
import { images } from './content.mjs';

const answerFor = (name, detail) =>
  `Call Harbison pays cash for houses and land in ${name}, CA, ${detail}. You can compare a direct as-is offer with listing on the market. Property access, inspections and closing timing depend on the written agreement, title and escrow.`;

export const cityAreas = [
  {
    slug: 'oildale',
    geo: [35.4194, -119.0187],
    answer: answerFor('Oildale', 'including older homes, rentals, inherited properties and houses that need repairs'),
    name: 'Oildale',
    title: 'We Buy Houses for Cash in Oildale, CA',
    description: 'Selling a house in Oildale? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Oildale house <em>for cash, as-is.</em>',
    lead: 'Oildale sits just north of Bakersfield across the Kern River, with a mix of older homes, rentals and larger lots.',
    image: images.suburban,
    body: [
      'Oildale is an unincorporated community, so zoning, permit and code questions go to Kern County rather than the City of Bakersfield. We confirm the jurisdiction early so the review starts from the right rules.',
      'Many Oildale homes are older, and some need roof, plumbing or electrical work. We look at the condition as it is and compare a cash as-is offer with listing, so you can see both numbers in writing.',
    ],
    places: ['Oildale', 'Bakersfield', 'North Bakersfield', 'Greenacres', 'Rosedale'],
    faqs: [
      ['Do you buy houses in Oildale?', 'Yes. We review Oildale houses, rentals and lots in any condition. Because Oildale is unincorporated, we confirm that Kern County is the right office for zoning and permit questions before discussing a plan.'],
      ['Can I sell an older Oildale house that needs repairs?', 'Yes. You can sell as-is without making repairs, though California still requires you to disclose known material defects. We compare an as-is cash offer with the cost and time of fixing and listing.'],
    ],
  },
  {
    slug: 'rosedale',
    geo: [35.38, -119.15],
    answer: answerFor('Rosedale', 'including newer subdivision homes, inherited properties and rentals'),
    name: 'Rosedale',
    title: 'We Buy Houses for Cash in Rosedale, CA',
    description: 'Selling a house in Rosedale or northwest Bakersfield? Call Harbison pays cash as-is and compares a written offer with listing.',
    headline: 'Sell your Rosedale house <em>for cash, as-is.</em>',
    lead: 'Rosedale and the northwest side of Bakersfield have many newer subdivisions, where condition, HOA rules and market demand shape the best way to sell.',
    image: images.home,
    body: [
      'Newer Rosedale-area homes often sell well on the open market, so listing can be a strong option. A cash offer can still make sense when you need a specific closing date, have tenants, or do not want to prepare the house for showings.',
      'If your home is in a homeowners association, tell us early. HOA documents, dues and any special assessments affect both a listing and a direct sale. We compare the two and show the assumptions in writing.',
    ],
    places: ['Rosedale', 'Northwest Bakersfield', 'Bakersfield', 'Oildale', 'Shafter'],
    faqs: [
      ['Should I list my Rosedale home or take a cash offer?', 'For a move-in-ready home in a strong neighborhood, listing often nets more. A cash offer helps when timing, tenants or condition matter more than the last dollar. We show both so you can compare.'],
      ['Does an HOA change how I sell?', 'It can. Sellers generally provide HOA documents to the buyer, and unpaid dues or assessments are handled at closing. Tell us about the HOA and we include it in the comparison.'],
    ],
  },
  {
    slug: 'lamont',
    geo: [35.2563, -118.9109],
    answer: answerFor('Lamont', 'including older homes, rentals and properties owned by out-of-area families'),
    name: 'Lamont',
    title: 'We Buy Houses for Cash in Lamont, CA',
    description: 'Selling a house in Lamont? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Lamont house <em>for cash, as-is.</em>',
    lead: 'Lamont is an unincorporated agricultural community southeast of Bakersfield, with older homes, rentals and family-owned properties.',
    image: images.classic,
    body: [
      'Lamont is unincorporated, so zoning and permit questions go to Kern County. We confirm that first, then review the house as it stands, including any additions, garages or outbuildings that may not have permits.',
      'Many Lamont properties are owned by families who live elsewhere or inherited the home. We can handle most of the review by phone, video and email, and compare a direct as-is offer with listing.',
    ],
    places: ['Lamont', 'Arvin', 'Bakersfield', 'Weedpatch', 'Kern County'],
    faqs: [
      ['Do you buy houses in Lamont?', 'Yes. We review Lamont houses, rentals and lots in any condition and confirm the jurisdiction early because Lamont is unincorporated.'],
      ['What if my Lamont house has unpermitted additions?', 'Tell us what you know. Unpermitted work affects value and next steps, but it does not automatically prevent a sale. We factor it into the comparison and note what a buyer may ask about.'],
    ],
  },
  {
    slug: 'delano',
    geo: [35.7688, -119.2471],
    answer: answerFor('Delano', 'including older homes, rentals and inherited properties'),
    name: 'Delano',
    title: 'We Buy Houses for Cash in Delano, CA',
    description: 'Selling a house in Delano? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Delano house <em>for cash, as-is.</em>',
    lead: 'Delano is a city in northern Kern County along Highway 99, surrounded by farmland, with a mix of older and newer homes.',
    image: images.valley,
    body: [
      'Delano is an incorporated city, so the City of Delano handles planning and permits inside city limits. For farm-area parcels outside the city, Kern County is the office to ask. We confirm which applies before reviewing a plan.',
      'We look at Delano houses, rentals and inherited homes as they are, then compare a direct as-is offer with listing so you can decide with both numbers in writing.',
    ],
    places: ['Delano', 'McFarland', 'Wasco', 'Shafter', 'Kern County'],
    faqs: [
      ['Do you buy houses in Delano and McFarland?', 'Yes. We review properties in Delano and nearby northern Kern County communities. Send the address and we confirm whether it is a fit.'],
      ['I live out of the area. Can I sell my Delano house remotely?', 'Usually, yes. Walkthroughs can be done by video or with someone you choose, documents are signed electronically, and closing goes through a licensed title or escrow company.'],
    ],
  },
  {
    slug: 'shafter',
    geo: [35.5005, -119.2718],
    answer: answerFor('Shafter', 'including older homes, rentals, inherited properties and houses near farmland'),
    name: 'Shafter',
    title: 'We Buy Houses for Cash in Shafter, CA',
    description: 'Selling a house in Shafter? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Shafter house <em>for cash, as-is.</em>',
    lead: 'Shafter is an agricultural city northwest of Bakersfield, with established neighborhoods, newer tracts and homes on larger lots.',
    image: images.suburban,
    body: [
      'Shafter homes range from older houses near the center of town to newer subdivisions and properties on bigger parcels. Condition, lot size and nearby uses all affect how a buyer sees the property.',
      'We review the house as it is and compare a cash as-is offer with listing. If the property has tenants, repairs or an unfinished project, tell us and we include it in the numbers.',
    ],
    places: ['Shafter', 'Wasco', 'Rosedale', 'Bakersfield', 'Delano'],
    faqs: [
      ['Do you buy houses in Shafter?', 'Yes. We review Shafter houses, rentals and lots in any condition. Send the address and what you know about the property.'],
      ['Do you buy homes on larger lots near farmland?', 'We review them case by case. Lot size, access, utilities and zoning matter, and we tell you quickly if a property is not a fit for a direct purchase.'],
    ],
  },
  {
    slug: 'wasco',
    geo: [35.5946, -119.3409],
    answer: answerFor('Wasco', 'including older homes, rentals and inherited properties'),
    name: 'Wasco',
    title: 'We Buy Houses for Cash in Wasco, CA',
    description: 'Selling a house in Wasco? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Wasco house <em>for cash, as-is.</em>',
    lead: 'Wasco is a farming city in northwest Kern County, known for its rose growers, with older neighborhoods and newer homes.',
    image: images.classic,
    body: [
      'Wasco is an incorporated city, so the City of Wasco handles planning and permits inside city limits, and Kern County handles parcels outside them. We confirm the jurisdiction early.',
      'We review Wasco houses, rentals and inherited properties as they are, then compare a direct as-is offer with listing so you can choose with the details in writing.',
    ],
    places: ['Wasco', 'Shafter', 'Delano', 'McFarland', 'Bakersfield'],
    faqs: [
      ['Do you buy houses in Wasco?', 'Yes. We review Wasco houses and lots in any condition and tell you quickly whether a property is a fit.'],
      ['Can I sell a Wasco rental with tenants?', 'Often, yes. Tell us about the lease. Tenants keep their rights under the lease and California law through a sale, so we review the lease before discussing access or timing. This is general information, not legal advice.'],
    ],
  },
  {
    slug: 'taft',
    geo: [35.1425, -119.4571],
    answer: answerFor('Taft', 'including older homes, rentals, inherited properties and houses that need repairs'),
    name: 'Taft',
    title: 'We Buy Houses for Cash in Taft, CA',
    description: 'Selling a house in Taft or west Kern County? Call Harbison pays cash as-is and compares a written offer with listing.',
    headline: 'Sell your Taft house <em>for cash, as-is.</em>',
    lead: 'Taft is an oil-country city in west Kern County, with many older homes and a smaller local buyer pool than Bakersfield.',
    image: images.street,
    body: [
      'Taft has many older houses, and a smaller pool of buyers can mean a listing takes longer or attracts fewer offers. That makes it worth comparing a direct as-is offer with listing before you decide.',
      'We review the house as it stands, including needed repairs, and show the numbers in writing. If you live outside the area, most of the process can be handled remotely.',
    ],
    places: ['Taft', 'Maricopa', 'Ford City', 'Bakersfield', 'Kern County'],
    faqs: [
      ['Do you buy houses in Taft and Maricopa?', 'Yes. We review properties in Taft and nearby west Kern County communities. Send the address and we confirm whether it is a fit.'],
      ['Will a listing take longer in a smaller market like Taft?', 'It can, because fewer buyers are shopping and many use loans that require appraisals and inspections. We compare timelines and net proceeds for a direct sale and a listing.'],
    ],
  },
  {
    slug: 'arvin',
    geo: [35.2091, -118.8284],
    answer: answerFor('Arvin', 'including older homes, rentals and properties owned by out-of-area families'),
    name: 'Arvin',
    title: 'We Buy Houses for Cash in Arvin, CA',
    description: 'Selling a house in Arvin? Call Harbison pays cash as-is and compares a written offer with listing. Local licensed agent, no obligation.',
    headline: 'Sell your Arvin house <em>for cash, as-is.</em>',
    lead: 'Arvin is an agricultural city southeast of Bakersfield near the base of the Tehachapi Mountains, with established neighborhoods and rentals.',
    image: images.suburban,
    body: [
      'Arvin is an incorporated city, so the City of Arvin handles planning and permits inside city limits, and Kern County handles unincorporated parcels nearby such as Lamont. We confirm which applies.',
      'We review Arvin houses and rentals as they are and compare a direct as-is offer with listing, with the assumptions behind each number shown in writing.',
    ],
    places: ['Arvin', 'Lamont', 'Weedpatch', 'Bakersfield', 'Tehachapi'],
    faqs: [
      ['Do you buy houses in Arvin and Lamont?', 'Yes. We review properties in Arvin and Lamont and confirm whether each address is in a city or in unincorporated Kern County.'],
      ['Can I sell a house with back property taxes or a lien?', 'Often, yes. Payoffs are handled through escrow at closing, so we ask for the payoff amounts early and include them in the comparison. Ask a qualified adviser about your specific situation.'],
    ],
  },
  {
    slug: 'ridgecrest',
    geo: [35.6225, -117.6709],
    answer: answerFor('Ridgecrest', 'including homes owned by relocating families, rentals, inherited properties and houses that need repairs'),
    name: 'Ridgecrest',
    title: 'We Buy Houses for Cash in Ridgecrest, CA',
    description: 'Selling a house in Ridgecrest or the Indian Wells Valley? Call Harbison pays cash as-is and compares a written offer with listing.',
    headline: 'Sell your Ridgecrest house <em>for cash, as-is.</em>',
    lead: 'Ridgecrest is a desert city in the Indian Wells Valley in northeast Kern County, close to the Naval Air Weapons Station China Lake.',
    image: images.land,
    body: [
      'Many Ridgecrest owners relocate for work connected to the base, and a move on a fixed date can make a direct sale worth comparing with listing. We compare timing, net proceeds and condition in writing.',
      'Desert properties can have their own issues, such as older cooling systems, foundation movement or earthquake-related repairs. Tell us what you know and we factor it in.',
    ],
    places: ['Ridgecrest', 'Inyokern', 'China Lake', 'Kern County', 'California City'],
    faqs: [
      ['Do you buy houses in Ridgecrest and Inyokern?', 'Yes. We review properties in the Indian Wells Valley. Send the address and we confirm whether it is a fit and how far we can handle remotely.'],
      ['I am relocating for work. Can I choose my closing date?', 'You can discuss a target date, and it is written into the agreement. Closing still depends on title and escrow, so we explain what could affect timing.'],
    ],
  },
];

export const bakersfieldZips = ['93301', '93302', '93303', '93304', '93305', '93306', '93307', '93308', '93309', '93311', '93312', '93313', '93314'];
