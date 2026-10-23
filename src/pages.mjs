// The list of pages the site is built from. Shared by the build and by the translation tooling.
import { areas, guides, situations } from './templates.mjs';
import {
  homePage, howItWorksPage, contactPage, accessibilityPage, situationPage, areaPage, situationsIndexPage, aboutPage, guidesIndexPage, guidePage,
  thankYouPage, notFoundPage, privacyPage, termsPage, familyPage, partnerGuidePage,
} from './templates.mjs';
import { family } from './family.mjs';

/** @returns {Array<[file: string, html: string, path: string|null, lastmod?: string]>} */
export function buildPages() {
  return [
    ['index.html', homePage(), '/'],
    ['about.html', aboutPage(), '/about'],
    ['how-it-works.html', howItWorksPage(), '/how-it-works'],
    ['contact.html', contactPage(), '/contact'],
    [`${family.path.slice(1)}.html`, familyPage(), family.path],
    ['family-property-guide.html', partnerGuidePage(), null],
    ['situations/index.html', situationsIndexPage(), '/situations'],
    ...situations.map((s) => [`situations/${s.slug}.html`, situationPage(s), `/situations/${s.slug}`]),
    ...areas.map((a) => [`areas/${a.slug}.html`, areaPage(a), `/areas/${a.slug}`]),
    ['guides/index.html', guidesIndexPage(), '/guides'],
    ...guides.map((g) => [`guides/${g.slug}.html`, guidePage(g), `/guides/${g.slug}`, g.updated]),
    ['privacy.html', privacyPage(), '/privacy'],
    ['terms.html', termsPage(), '/terms'],
    ['accessibility.html', accessibilityPage(), '/accessibility'],
    ['thank-you.html', thankYouPage(), null],
    ['404.html', notFoundPage(), null],
  ];
}
