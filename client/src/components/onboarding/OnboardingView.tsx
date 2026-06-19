import React from 'react';

interface OnboardingViewProps {
  newBotName: string;
  setNewBotName: (name: string) => void;
  newBotIndustry: string;
  setNewBotIndustry: (industry: string) => void;
  newBotGreeting: string;
  setNewBotGreeting: (greeting: string) => void;
  newBotKB: string;
  setNewBotKB: (kb: string) => void;
  newBotColor: string;
  setNewBotColor: (color: string) => void;
  setView: (view: string) => void;
  handleCreateBot: (e: React.FormEvent) => void;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({
  newBotName,
  setNewBotName,
  newBotIndustry,
  setNewBotIndustry,
  newBotGreeting,
  setNewBotGreeting,
  newBotKB,
  setNewBotKB,
  newBotColor,
  setNewBotColor,
  setView,
  handleCreateBot
}: OnboardingViewProps) => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 w-full">
      <div className="bg-brand-card rounded-2xl border border-brand-border p-8 lg:p-12 shadow-xl relative">
        <div className="mb-8">
          <span className="text-brand-accent text-xs font-mono tracking-widest uppercase font-semibold">Self-Serve Onboarding</span>
          <h2 className="text-3xl font-display font-extrabold mt-2 text-brand-text">Configure Your AI Agent</h2>
          <p className="text-sm text-brand-muted mt-2 font-sans">Set up your conversational rules, knowledge bases, and custom endpoints.</p>
        </div>

        <form onSubmit={handleCreateBot} className="space-y-8">
          {/* Section 1: Core Profile */}
          <div className="space-y-4">
            <h3 className="text-lg font-display font-bold text-brand-text border-b border-brand-border pb-2">1. Business Profile</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Business or Academy Name</label>
                <input
                  type="text"
                  required
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="e.g., Apex Coding Academy"
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm focus:ring-1 focus:ring-brand-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Industry Sector</label>
                <select
                  value={newBotIndustry}
                  onChange={(e) => setNewBotIndustry(e.target.value)}
                  className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text focus:outline-none transition duration-200 font-sans text-sm focus:ring-1 focus:ring-brand-accent"
                >
                  <option value="Education">Education & Academies</option>
                  <option value="Healthcare">Healthcare & Clinics</option>
                  <option value="Real Estate">Real Estate & Properties</option>
                  <option value="Recruitment">Recruitment & HR Tech</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Chat Customization */}
          <div className="space-y-4">
            <h3 className="text-lg font-display font-bold text-brand-text border-b border-brand-border pb-2">2. Chatbot Branding & Tone</h3>
            
            <div>
              <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">AI Greeting Message</label>
              <textarea
                rows={3}
                value={newBotGreeting}
                onChange={(e) => setNewBotGreeting(e.target.value)}
                placeholder="Welcome to our institute! I am your virtual receptionist..."
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm leading-relaxed focus:ring-1 focus:ring-brand-accent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-brand-muted uppercase tracking-wider mb-2 font-mono">Primary Color UI Theme</label>
                <div className="flex items-center space-x-3 mt-1.5">
              {['indigo', 'emerald', 'rose', 'amber'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewBotColor(c)}
                      className={`w-10 h-10 rounded-full border-2 transition duration-200 ${newBotColor === c ? 'border-brand-text scale-110 shadow-md' : 'border-transparent'} ${c === 'indigo' ? 'bg-indigo-600' : c === 'emerald' ? 'bg-brand-success' : c === 'rose' ? 'bg-brand-danger' : 'bg-brand-warning'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Training Knowledge base */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-brand-border pb-2">
              <h3 className="text-lg font-display font-bold text-brand-text">3. Knowledge Base & FAQ Training</h3>
              <span className="text-[10px] text-brand-accent font-mono tracking-widest bg-brand-accent/10 border border-brand-border/40 px-2 py-0.5 rounded uppercase">RAG Engine Ready</span>
            </div>
            
            <p className="text-xs text-brand-muted leading-relaxed mb-2 font-sans">
              Enter details about courses, timetables, fees, consultation costs, location coordinates, or general rules. Our integrated Gemini LLM uses this data to respond dynamically.
            </p>
            
            <div>
              <textarea
                rows={6}
                required
                value={newBotKB}
                onChange={(e) => setNewBotKB(e.target.value)}
                placeholder="Add system details (fees, batches, rules, location, hours...)"
                className="w-full bg-brand-bg border border-brand-border focus:border-brand-accent rounded-lg px-4 py-3 text-brand-text placeholder-brand-muted/40 focus:outline-none transition duration-200 font-sans text-sm leading-relaxed focus:ring-1 focus:ring-brand-accent"
              />
            </div>
          </div>


          {/* Create CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-6 border-t border-brand-border">
            <button
              type="button"
              onClick={() => setView('landing')}
              className="w-full sm:w-auto px-6 py-2.5 bg-brand-bg hover:bg-brand-card border border-brand-border text-brand-text font-sans font-semibold text-sm rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto px-8 py-2.5 bg-brand-accent hover:bg-brand-accent-hover text-brand-text border border-brand-border font-sans font-semibold text-sm rounded-lg shadow-md transition"
            >
              Generate Live AI Receptionist
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
