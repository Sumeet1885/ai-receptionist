import { useState } from 'react';
import { ArrowUpRight, BriefcaseBusiness, GraduationCap, House, ShoppingBag } from 'lucide-react';

const industries = [
  {
    name: 'Education', icon: GraduationCap, image: 'education',
    title: 'Find the next learner.',
    text: 'Understand course interest, goals, and preferred enrolment timelines.',
    question: 'Which course would you like to explore?',
    answer: 'A data analytics course I can take alongside work.',
    outcome: 'Course interest → Counselling follow-up',
    imageAlt: 'Course workbook and graduation cap',
  },
  {
    name: 'Business services', icon: BriefcaseBusiness, image: 'services',
    title: 'Understand the brief.',
    text: 'Ask about the business need, scope, priorities, and budget.',
    question: 'What does your team need help with?',
    answer: 'We are looking for a partner to build our website.',
    outcome: 'Requirement → Team discussion',
    imageAlt: 'Business brief and project priorities on a laptop',
  },
  {
    name: 'Retail & commerce', icon: ShoppingBag, image: 'retail',
    title: 'Know what they’re looking for.',
    text: 'Discover product interest, preferences, and purchase intent.',
    question: 'What are you looking for today?',
    answer: 'A standing desk that fits a small home office.',
    outcome: 'Product preference → Sales follow-up',
    imageAlt: 'Shopping bags and a customer product enquiry',
  },
  {
    name: 'Real estate', icon: House, image: 'property',
    title: 'Find the right fit.',
    text: 'Understand location, budget, configuration, and interest in a visit.',
    question: 'What would your ideal home look like?',
    answer: 'A two-bedroom apartment near the metro.',
    outcome: 'Buyer need → Property discussion',
    imageAlt: 'A home and a location pin for a property enquiry',
  },
];

/** A compact industry selector with one shared, user-controlled example stage. */
export function IndustryExplorer() {
  const [selected, setSelected] = useState(0);
  const industry = industries[selected];

  return (
    <div className="industry-explorer">
      <div className="industry-selector">
        <span className="eyebrow">CHOOSE YOUR WORLD</span>
        <div className="industry-options" role="group" aria-label="Choose an industry">
          {industries.map(({ name, icon: Icon }, index) => (
            <button key={name} type="button" className="industry-option"
              aria-pressed={selected === index} aria-controls="industry-preview"
              onClick={() => setSelected(index)}>
              <span className="industry-option-number" aria-hidden="true">0{index + 1}</span>
              <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              <span>{name}</span>
              <ArrowUpRight className="industry-option-arrow" size={20} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="industry-selector-note">Different questions.<br /><em>The same thoughtful approach.</em></p>
      </div>
      <div id="industry-preview" className="industry-preview" role="region" aria-label={`${industry.name} conversation example`}>
        <div key={industry.image} className="industry-preview-content">
          <div className="industry-preview-intro">
            <div>
              <span className="eyebrow">{industry.name} / EXAMPLE</span>
              <h3>{industry.title}</h3>
            </div>
            <img src={`/bolegaindia/images/industry-${industry.image}.svg`} alt={industry.imageAlt}
              width="800" height="480" loading="lazy" decoding="async" />
          </div>
          <p className="industry-description">{industry.text}</p>
          <div className="industry-conversation">
            <div className="industry-conversation-top"><span className="eyebrow">A LITTLE CONTEXT GOES A LONG WAY</span><span aria-hidden="true">✦</span></div>
            <span className="industry-speaker">YOUR AI PERSONA</span>
            <p className="industry-question">{industry.question}</p>
            <div className="industry-answer"><span>CUSTOMER</span><p>{industry.answer}</p></div>
            <div className="industry-next-step"><span>{industry.outcome}</span><ArrowUpRight size={19} aria-hidden="true" /></div>
          </div>
        </div>
      </div>
      <span className="industry-status" role="status">Showing the {industry.name.toLowerCase()} example. Illustrative conversation.</span>
    </div>
  );
}
