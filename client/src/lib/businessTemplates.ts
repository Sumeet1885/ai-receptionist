import { LeadField } from '../types';

export interface BusinessTemplate {
  id: string;
  name: string;
  badge: string;
  icon: string;
  industry: string;
  defaultName: string;
  greeting: string;
  knowledgeBase: string;
  primaryColor: string;
  tagline: string;
  features: string[];
  requiredLeadFields: LeadField[];
  suggestedPrompts: string[];
}

export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: 'healthcare',
    name: 'Dental & Healthcare Clinic',
    badge: 'Appointments & Insurance',
    icon: '🏥',
    industry: 'Healthcare',
    defaultName: 'SmileCare Dental & Wellness Clinic',
    tagline: 'Trained on appointment slots, insurance queries, and emergency triage',
    features: ['Appointment Scheduling', 'Insurance Verification', 'Emergency Triage', 'Doctor Hours'],
    primaryColor: 'emerald',
    requiredLeadFields: ['name', 'phone', 'requirement'],
    suggestedPrompts: [
      'Book dental cleaning',
      'Check insurance coverage',
      'Emergency toothache',
      'Doctor availability'
    ],
    greeting: "Welcome to SmileCare Clinic! I'm your virtual medical receptionist. I can help you schedule appointments, check doctor availability, and answer questions about cleanings, procedures, or insurance coverage. How can I assist you today?",
    knowledgeBase: `SmileCare Dental & Wellness Clinic Guide:
1. Services & Standard Costs:
- Routine Dental Cleaning & Comprehensive Exam: $99 (45 mins)
- Professional Teeth Whitening Treatment: $249 (60 mins)
- Dental Implants & Porcelain Crowns: Consultation starting at $150
- Emergency Tooth Pain & Gentle Extractions: Priority same-day slots reserved
2. Doctor & Provider Availability:
- Dr. Sarah Johnson (Lead Dental Surgeon): Monday to Thursday, 9:00 AM - 5:00 PM
- Dr. Michael Chen (Orthodontics & Aligners): Friday and Saturday, 10:00 AM - 4:00 PM
3. Insurance Accepted:
- In-network with Delta Dental, Cigna, MetLife, Aetna, Blue Cross Blue Shield, and Guardian.
- 0% interest monthly payment plans available through CareCredit.
4. Emergency Triage Guidelines:
- For acute toothache, swelling, bleeding, or broken teeth, immediate triage appointments are open daily from 1:00 PM - 2:00 PM.
5. Location & Facility Details:
- 450 Health Avenue, Suite 200, Downtown. Free patient parking in rear lot.`
  },
  {
    id: 'real_estate',
    name: 'Real Estate Agency',
    badge: 'Property Visits & Leads',
    icon: '🏠',
    industry: 'Real Estate',
    defaultName: 'Apex Horizon Luxury Realty',
    tagline: 'Trained on property visits, budget qualification, and agent handover',
    features: ['Site Visit Scheduling', 'Budget Qualification', 'Neighborhood Guides', 'Agent Handover'],
    primaryColor: 'indigo',
    requiredLeadFields: ['name', 'phone', 'email', 'requirement', 'budget'],
    suggestedPrompts: [
      'Schedule site visit',
      'Explore 2 & 3 BHK listings',
      'Check property pricing',
      'Mortgage pre-approval'
    ],
    greeting: "Welcome to Apex Horizon Realty! I'm your AI property specialist. Are you looking to buy, sell, or rent? I can help you explore premium listings, check neighborhood pricing, or schedule a private site visit.",
    knowledgeBase: `Apex Horizon Luxury Realty Portfolio:
1. Featured Active Listings:
- "The Grandview Residences": 2 & 3 BHK luxury condominiums starting at $450,000. Features skyline balcony, heated pool, rooftop lounge, and 24/7 concierge.
- "Oakwood Villa Estate": 4 BHK independent luxury villas starting at $1.2M. Private garden, 2-car garage, gated community.
2. Property Viewings & Tours:
- Open House Tours: Saturdays and Sundays from 11:00 AM to 5:00 PM.
- Private Guided Site Visits: Available Monday to Friday by prior appointment.
3. Buyer Qualification & Financing:
- Pre-approval assistance available with our partner mortgage lenders. Down payment assistance programs for first-time buyers.
4. Office Location & Consultation:
- 120 Financial Boulevard, Floor 14. Virtual 3D video tours also available upon request.`
  },
  {
    id: 'hospitality',
    name: 'Restaurant & Hospitality',
    badge: 'Table Booking & Menus',
    icon: '🍽️',
    industry: 'Hospitality',
    defaultName: 'La Bella Vista Bistro & Wine Bar',
    tagline: 'Trained on table reservations, party sizes, and dining hours',
    features: ['Table Reservations', 'Large Party Booking', 'Menu & Dietary FAQs', 'Valet & Hours'],
    primaryColor: 'amber',
    requiredLeadFields: ['name', 'phone', 'requirement'],
    suggestedPrompts: [
      'Reserve a table for 4',
      'View dinner & wine menu',
      'Dietary & vegan options',
      'Parking & dress code'
    ],
    greeting: "Bonjour and welcome to La Bella Vista Bistro! I can assist you with reserving a table, party bookings, browsing our dinner menu and specials, or answering dietary questions. When would you like to dine with us?",
    knowledgeBase: `La Bella Vista Bistro Dining Information:
1. Hours of Operation:
- Lunch: Tuesday to Sunday, 12:00 PM - 3:30 PM
- Dinner: Tuesday to Sunday, 5:30 PM - 10:30 PM
- Closed on Mondays for private culinary prep.
2. Table Reservations:
- Standard Dining: Tables for 1 to 6 guests can be booked online or via phone.
- Private Chef's Table & Large Parties (7+ guests): Requires 24-hour advance booking and deposit.
3. Menu & Specialties:
- Handcrafted Italian & Mediterranean Cuisine. Fresh handmade pasta daily, wood-fired seafood, curated Tuscan wine cellar.
- Dietary Accommodations: Full gluten-free pasta menu, vegan risotto, and certified nut-free prep kitchen.
4. Parking & Dress Code:
- Valet parking available after 6:00 PM. Smart casual dress code.
- Location: 88 Harbor Promenade. Outdoor heated patio seating available weather permitting.`
  },
  {
    id: 'automotive',
    name: 'Car Dealership & Auto Service',
    badge: 'Test Drives & Service',
    icon: '🚗',
    industry: 'Automotive',
    defaultName: 'Vanguard Motors & Precision Auto Care',
    tagline: 'Trained on test drives, service bookings, and vehicle models',
    features: ['VIP Test Drives', 'Service Bay Booking', 'Pre-Owned Inventory', 'Loaner Vehicle Info'],
    primaryColor: 'rose',
    requiredLeadFields: ['name', 'phone', 'requirement', 'budget'],
    suggestedPrompts: [
      'Schedule VIP test drive',
      'Book oil & filter service',
      'Explore electric SUV pricing',
      'Check trade-in valuation'
    ],
    greeting: "Hello and welcome to Vanguard Motors! Whether you're interested in scheduling a VIP test drive, exploring new and certified pre-owned vehicles, or booking factory-certified maintenance, I'm here to help. What can I assist you with today?",
    knowledgeBase: `Vanguard Motors Showroom & Precision Care Guide:
1. New & Certified Pre-Owned Inventory:
- Vanguard Horizon EV: Electric luxury SUV, 350-mile range. Starting at $48,900.
- Vanguard Apex Sedan: Turbocharged sport luxury sedan. Starting at $38,500.
- Certified Pre-Owned: 120-point inspection, 2-year bumper-to-bumper warranty included.
2. Test Drive Scheduling:
- Test drives available daily from 9:30 AM to 7:00 PM. Bring valid driver's license and insurance proof.
3. Precision Service Department:
- Factory Scheduled Oil & Filter Service: $79.99 (includes 30-point safety inspection).
- Brake Service & Rotor Resurfacing: Starting at $189.
- Tire Rotation, Balancing & Wheel Alignment: $89.
- Loaner Vehicles: Complimentary luxury loaner car for all major service visits over 3 hours.
4. Showroom & Service Center Location:
- 1050 Motor Mile Boulevard. Express Service Bay open Monday through Saturday from 7:30 AM.`
  }
];
