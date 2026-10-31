# Landing page reading order

The landing page now leads with the product's purpose before explaining configuration and offering examples. Existing hero design, generated media, responsive layouts and conversation controls are retained.

| Order | Section | Purpose | Navigation |
| --- | --- | --- | --- |
| 1 | Hero and ticker | Introduce the promise and offer a voice sample | Logo returns to `#hero` |
| 2 | More than a call | Explain familiarity, relevance and purpose | Product → `#product-persona` |
| 3 | Built around your business | Explain the business persona | Product stays active at `#business-persona` |
| 4 | How it works | Explain persona, contacts, calls and lead review | How it works → `#workflow` |
| 5 | Context changes the follow-up | Listen to wedding, business and multilingual examples | Conversations → `#how-system` |
| 6 | Familiar feels better | Explore supported language greetings | Languages → `#languages` |
| 7 | Prepare for a better follow-up | Watch an enquiry and explore the context captured | Follow-up → `#lead-story` |
| 8 | Different businesses, familiar needs | Explore industry-specific questions | Use cases → `#use-cases` |
| 9 | A little clarity | Resolve product questions | FAQs → `#questions` |
| 10 | Your next hello starts here | Get started | `#get-started`; existing sign-in and trial routes retained |

`landingNavigation.ts` defines the navbar order and the sections belonging to each navigation group. The current link follows the last section crossing the fixed header, rather than the order of IntersectionObserver callbacks. It clears at the hero and closing CTA. Desktop and mobile menus use the same configuration and `aria-current="location"` state. Existing public fragment IDs are retained; `business-persona` and `get-started` are added.

The mobile menu is used up to 1350px to avoid crowded desktop links. Section anchors have a sticky-header offset; the mobile menu scrolls internally on short screens. Pricing, authentication, dashboard and trial routes are unchanged. The ticker now says “Start your campaign” instead of implying unavailable future call scheduling.
