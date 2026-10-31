/** Navigation groups follow the visual reading order. Existing public fragment IDs stay stable. */
export const landingNavigation = [
  { id: 'product-persona', label: 'Product', sections: ['product-persona', 'business-persona'] },
  { id: 'workflow', label: 'How it works', sections: ['workflow'] },
  { id: 'how-system', label: 'Conversations', sections: ['how-system'] },
  { id: 'lead-story', label: 'Follow-up', sections: ['lead-story'] },
  { id: 'use-cases', label: 'Use cases', sections: ['use-cases'] },
  { id: 'questions', label: 'FAQs', sections: ['questions'] },
] as const;
