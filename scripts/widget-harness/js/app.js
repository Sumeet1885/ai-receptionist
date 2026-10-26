// 0. SAFE LOCAL STORAGE PERSISTENCE UTILITY
const SafeStorage = {
  _tempMemory: {},
  getItem(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
      console.warn("Storage access denied. Accessing local temporary state memory.");
      return this._tempMemory[key] || null;
    }
  },
  setItem(key, value) {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn("Storage write access denied. Preserving state inside memory structures.");
      this._tempMemory[key] = value;
    }
  }
};

// 1. STATE MANAGEMENT
const AppState = {
  currentTheme: 'dark', 
  currentIndustry: 'healthcare',
  currentLanguage: 'en',
  sentimentScore: 'neutral', 
  leadConfidence: 20, 
  cloningState: 'idle', 
  capturedData: {
    name: 'Waiting...',
    phone: 'Waiting...',
    requirement: 'Waiting...',
    budget: 'Waiting...'
  },
  
  // Dialogue models for the interactive simulator environment
  simulationDatabase: {
    healthcare: {
      agentName: "Green Valley AI Clinic Desk",
      initialMessage: "Hello, thank you for calling Green Valley Clinic. I'm your virtual healthcare receptionist. How can I assist you today?",
      options: [
        {
          label: "Inquire doctor fees & address",
          userSays: "What are your consultation fees, and where are you located?",
          aiReply: "Our clinical consultation fee is $50. We are located at 45 Medical Parkway, Suite 102. Walk-ins are accepted, or I can book your appointment right now.",
          analytics: {
            sentiment: "Cooperative",
            leadScore: 45,
            summary: "• Caller requested fee scales & address.\n• Sent fee ($50) & clinic location.",
            fields: { requirement: "Consultation inquiry" }
          }
        },
        {
          label: "Schedule a patient appointment",
          userSays: "I want to schedule an appointment for tomorrow afternoon.",
          aiReply: "Dr. Roberts has open slots at 2:30 PM or 4:00 PM tomorrow. May I take your name and phone number to secure the scheduling slot?",
          analytics: {
            sentiment: "Positive",
            leadScore: 70,
            summary: "• Schedule inquiry tomorrow afternoon.\n• Initiated booking intake workflow.",
            fields: { requirement: "Schedule slot requested" }
          }
        },
        {
          label: "Urgent Clinical Checkup",
          userSays: "I need to talk to a doctor immediately, I am feeling very dizzy!",
          aiReply: "I understand this is urgent. While I register your details, if this is a severe medical emergency, please dial 911 immediately. Let me gather your contact details to alert our attending doctor.",
          analytics: {
            sentiment: "Urgent",
            leadScore: 90,
            summary: "• Urgent: Symptom parameters dizziness.\n• Triggering high-priority nurse escalation routine.",
            fields: { requirement: "Urgent clinical checkup" }
          }
        }
      ]
    },
    recruitment: {
      agentName: "Recrui8 Unified Recruiting Representative",
      initialMessage: "Hi, thanks for calling the recruiting desk, powered by Recrui8. Are you calling to track open developer positions, or check candidate application status?",
      options: [
        {
          label: "Check open tech positions",
          userSays: "Do you have any open positions for Senior React Developer?",
          aiReply: "We have two open roles for Senior React Developer starting at $110,000. Would you like me to send you the application checklist?",
          analytics: {
            sentiment: "Positive",
            leadScore: 50,
            summary: "• Inquired about open React positions.\n• Quoted salary base $110,000.",
            fields: { requirement: "React Developer openings" }
          }
        },
        {
          label: "Track applicant status",
          userSays: "I completed my technical vetting interview. I want to check my status.",
          aiReply: "Perfect! Let me query your applicant records. What is your full name so I can scan the integrated Recrui8 database?",
          analytics: {
            sentiment: "Cooperative",
            leadScore: 65,
            summary: "• Candidate requested application progress status.\n• Scans ATS candidate database.",
            fields: { requirement: "Applicant progress review" }
          }
        }
      ]
    },
    realestate: {
      agentName: "North Valley Homes Concierge AI",
      initialMessage: "Welcome to North Valley Realty. I can share layout maps, price points, or schedule property site tours. What are you looking for today?",
      options: [
        {
          label: "Request layout pricing structure",
          userSays: "I want to know the pricing structure for 3-Bedroom villas.",
          aiReply: "Our premium 3-Bedroom villa properties start at $245,000 with a flexible 20% downpayment. May I have your phone number to WhatsApp you the structural floorplans?",
          analytics: {
            sentiment: "Positive",
            leadScore: 60,
            summary: "• Client requested layout configurations & prices.\n• Quoted starting pricing at $245,000.",
            fields: { requirement: "3-BHK Villa price list", budget: "$245k Base" }
          }
        },
        {
          label: "Schedule site visit tomorrow",
          userSays: "Can I book a guided site visit for tomorrow afternoon?",
          aiReply: "We have open slots at 1:00 PM and 3:30 PM tomorrow. I'll reserve a guide broker to accompany you. What is your contact phone number?",
          analytics: {
            sentiment: "High Intent",
            leadScore: 85,
            summary: "• Requested physical site visit tomorrow.\n• Assigning dedicated field broker.",
            fields: { requirement: "Site visit scheduling", budget: "Warm Buyer" }
          }
        }
      ]
    },
    education: {
      agentName: "Admissions Office Counsel AI",
      initialMessage: "Hello, this is the university admissions office. I can assist with tuition fee queries, application deadlines, and scholarship requirements. What course are you exploring?",
      options: [
        {
          label: "Inquire course semester tuition",
          userSays: "What are the tuition fees for the computer science program?",
          aiReply: "Tuition for our computer science program is $12,500 per semester. We also offer academic merit scholarships up to 45%. Shall I record your name for eligibility?",
          analytics: {
            sentiment: "Cooperative",
            leadScore: 50,
            summary: "• Requested computer science tuition scales.\n• Quoted tuition $12.5k per semester.",
            fields: { requirement: "CS Tuition structure" }
          }
        },
        {
          label: "Check admission deadlines",
          userSays: "When is the last date to submit the enrollment application?",
          aiReply: "The enrollment portal closes on June 15th for priority candidates, and July 30th for standard applicants. Shall I dispatch the application links?",
          analytics: {
            sentiment: "Positive",
            leadScore: 70,
            summary: "• Checking academic submission deadlines.\n• Shared priority date (June 15).",
            fields: { requirement: "Admissions deadline" }
          }
        }
      ]
    }
  }
};

// 2. DOM ELEMENT MATRIX CACHE
const DOM = {
  // Theme Toggle elements
  themeToggle: document.getElementById('theme-toggle'),
  themeToggleMobile: document.getElementById('theme-toggle-mobile'),
  
  // Mobile Nav Overlays
  mobileMenuBtn: document.querySelector('.mobile-menu-btn'),
  mobileOverlay: document.querySelector('.mobile-nav-overlay'),
  mobileCloseBtn: document.querySelector('.mobile-close-btn'),
  mobileLinks: document.querySelectorAll('.mobile-link'),
  
  // Hero console tabs
  visualTabs: document.querySelectorAll('.console-tab'),
  tabContents: document.querySelectorAll('.console-body'),
  
  // Interactive Simulator
  selectorBtns: document.querySelectorAll('.selector-btn'),
  activeAgentName: document.getElementById('active-agent-name'),
  chatInitialMessage: document.getElementById('chat-initial-message'),
  chatStreamBox: document.getElementById('chat-stream-box'),
  quickReplyOptions: document.getElementById('quick-reply-options'),
  customUserText: document.getElementById('custom-user-text'),
  sendCustomMsgBtn: document.getElementById('send-custom-msg-btn'),
  
  // Simulator Telemetry Dash
  tempIndicatorCold: document.getElementById('temp-indicator-cold'),
  tempIndicatorWarm: document.getElementById('temp-indicator-warm'),
  tempIndicatorHot: document.getElementById('temp-indicator-hot'),
  leadScoreProgressBar: document.getElementById('lead-score-progress-bar'),
  leadScoreText: document.getElementById('lead-score-text'),
  sentimentIcon: document.getElementById('sentiment-icon'),
  sentimentText: document.getElementById('sentiment-text'),
  crmCapturedName: document.getElementById('crm-captured-name'),
  crmCapturedPhone: document.getElementById('crm-captured-phone'),
  crmCapturedReq: document.getElementById('crm-captured-req'),
  crmCapturedBudget: document.getElementById('crm-captured-budget'),
  liveCallSummaryBox: document.getElementById('live-call-summary-box'),
  sandboxLanguagePicker: document.getElementById('sandbox-language-picker'),
  
  // Industry Showcase Vertical Cards
  showcaseCards: document.querySelectorAll('.showcase-card'),
  vShowcaseTitle: document.getElementById('v-showcase-title'),
  vShowcasePill: document.getElementById('v-showcase-pill'),
  vShowcaseDesc: document.getElementById('v-showcase-desc'),
  vStatLbl1: document.getElementById('v-stat-lbl-1'),
  vStatVal1: document.getElementById('v-stat-val-1'),
  vStatFill1: document.getElementById('v-stat-fill-1'),
  vStatLbl2: document.getElementById('v-stat-lbl-2'),
  vStatVal2: document.getElementById('v-stat-val-2'),
  vStatFill2: document.getElementById('v-stat-fill-2'),
  
  // Voice Cloning Spec
  voiceWaves: document.getElementById('voice-waves'),
  cloningTimer: document.getElementById('cloning-timer'),
  startVoiceCloneBtn: document.getElementById('start-voice-clone-btn'),
  playClonedBtn: document.getElementById('play-cloned-btn'),
  cloningStatusMsg: document.getElementById('cloning-status-msg'),
  
  // ROI Slider structures
  callsRange: document.getElementById('calls-range'),
  hoursRange: document.getElementById('hours-range'),
  missedCallsRange: document.getElementById('missed-calls'),
  callsCountVal: document.getElementById('calls-count-val'),
  rateVal: document.getElementById('rate-val'),
  missedVal: document.getElementById('missed-val'),
  roiSavingsCalc: document.getElementById('roi-savings-calc'),
  roiHoursSaved: document.getElementById('roi-hours-saved'),
  roiLeadsSaved: document.getElementById('roi-leads-saved'),
  
  // Lead submission form
  leadSignupForm: document.getElementById('lead-signup-form'),
  formSuccessAlert: document.getElementById('form-success-alert'),
  clientName: document.getElementById('client-name'),
  clientPhone: document.getElementById('client-phone'),
  clientIndustry: document.getElementById('client-industry'),
  clientBudget: document.getElementById('client-budget')
};

// 3. UI RENDERING AND LOGICAL WORKFLOWS
const App = {
  init() {
    this.detectSavedTheme();
    this.registerEvents();
    this.renderSimulatorOptions();
    this.calculateROI();
    
    // Initialise lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  // Premium dark/light themes selector engine
  detectSavedTheme() {
    const savedTheme = SafeStorage.getItem('ireceptionist-premium-theme') || 'dark';
    AppState.currentTheme = savedTheme;
    if (savedTheme === 'light') {
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    } else {
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    }
  },

  toggleTheme() {
    if (AppState.currentTheme === 'dark') {
      AppState.currentTheme = 'light';
      document.body.classList.remove('dark-mode');
      document.body.classList.add('light-mode');
    } else {
      AppState.currentTheme = 'dark';
      document.body.classList.remove('light-mode');
      document.body.classList.add('dark-mode');
    }
    SafeStorage.setItem('ireceptionist-premium-theme', AppState.currentTheme);
  },

  registerEvents() {
    // Theme Switch actions
    DOM.themeToggle.addEventListener('click', () => this.toggleTheme());
    if (DOM.themeToggleMobile) {
      DOM.themeToggleMobile.addEventListener('click', () => this.toggleTheme());
    }

    // Mobile Navbar Overlay Toggle
    DOM.mobileMenuBtn.addEventListener('click', () => DOM.mobileOverlay.classList.add('active'));
    DOM.mobileCloseBtn.addEventListener('click', () => DOM.mobileOverlay.classList.remove('active'));
    DOM.mobileLinks.forEach(link => {
      link.addEventListener('click', () => DOM.mobileOverlay.classList.remove('active'));
    });

    // Hero Widget Console Switch Tabs
    DOM.visualTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        DOM.visualTabs.forEach(t => t.classList.remove('active'));
        DOM.tabContents.forEach(c => c.classList.remove('active'));
        
        tab.classList.add('active');
        const contentId = `tab-${tab.getAttribute('data-tab')}`;
        const activeContent = document.getElementById(contentId);
        if (activeContent) activeContent.classList.add('active');
      });
    });

    // Industry selector in simulator environment
    DOM.selectorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        DOM.selectorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        AppState.currentIndustry = btn.getAttribute('data-industry');
        this.renderSimulatorOptions();
      });
    });

    // Industry showcase configuration trigger
    DOM.showcaseCards.forEach(card => {
      card.addEventListener('click', () => {
        DOM.showcaseCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        
        const industryName = card.getAttribute('data-showcase');
        this.updateDynamicShowcaseScreen(industryName);
      });
    });

    // Custom chat prompt buttons
    DOM.sendCustomMsgBtn.addEventListener('click', () => this.handleCustomMessageSend());
    DOM.customUserText.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleCustomMessageSend();
    });

    // Voice Cloning Simulation triggers
    DOM.startVoiceCloneBtn.addEventListener('click', () => this.simulateVoiceCloning());
    DOM.playClonedBtn.addEventListener('click', () => this.simulateVoiceClonedPlayback());

    // ROI Modeling calculation triggers
    DOM.callsRange.addEventListener('input', () => {
      DOM.callsCountVal.textContent = Number(DOM.callsRange.value).toLocaleString();
      this.calculateROI();
    });
    DOM.hoursRange.addEventListener('input', () => {
      DOM.rateVal.textContent = `$${DOM.hoursRange.value}/hr`;
      this.calculateROI();
    });
    DOM.missedCallsRange.addEventListener('input', () => {
      DOM.missedVal.textContent = `${DOM.missedCallsRange.value}%`;
      this.calculateROI();
    });

    // Lead Generation Form integration
    DOM.leadSignupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLeadFormSubmit();
    });
  },

  // Generates choices in the dynamic simulator viewport
  renderSimulatorOptions() {
    const currentData = AppState.simulationDatabase[AppState.currentIndustry];
    DOM.activeAgentName.textContent = currentData.agentName;
    
    // Refresh chat logs and initialize welcoming string
    DOM.chatStreamBox.innerHTML = `
      <div class="chat-bubble-ai">
        <span class="sender-label">AI Receptionist</span>
        <p>${currentData.initialMessage}</p>
      </div>
    `;

    // Reset telemetry metrics
    this.updateTelemetry({
      sentiment: "Cooperative",
      leadScore: 20,
      summary: "* Conversation initialized.\n* Ready to capture user interactions.",
      fields: { requirement: "Waiting...", budget: "Waiting..." }
    });

    // Rebuild options block
    DOM.quickReplyOptions.innerHTML = '';
    currentData.options.forEach(opt => {
      const button = document.createElement('button');
      button.className = 'quick-reply-btn';
      button.textContent = opt.label;
      button.addEventListener('click', () => this.executeSimulatorInteraction(opt));
      DOM.quickReplyOptions.appendChild(button);
    });
  },

  // Simulates conversational processing steps
  executeSimulatorInteraction(option) {
    const userMsgHTML = `
      <div class="chat-bubble-user">
        <span class="sender-label">Caller</span>
        <p>"${option.userSays}"</p>
      </div>
    `;
    DOM.chatStreamBox.insertAdjacentHTML('beforeend', userMsgHTML);

    // Render loading dots indicator
    const typingHTML = `
      <div class="chat-bubble-ai" id="sim-typing">
        <span class="sender-label">AI is processing...</span>
        <div class="audio-spectrum" style="height: 14px; background: none;">
          <span class="spectrum-bar sound-wave-1"></span>
          <span class="spectrum-bar sound-wave-2"></span>
          <span class="spectrum-bar sound-wave-3"></span>
        </div>
      </div>
    `;
    DOM.chatStreamBox.insertAdjacentHTML('beforeend', typingHTML);
    DOM.chatStreamBox.scrollTop = DOM.chatStreamBox.scrollHeight;

    setTimeout(() => {
      const typingEl = document.getElementById('sim-typing');
      if (typingEl) typingEl.remove();

      const aiReplyHTML = `
        <div class="chat-bubble-ai">
          <span class="sender-label">AI Receptionist</span>
          <p>${option.aiReply}</p>
        </div>
      `;
      DOM.chatStreamBox.insertAdjacentHTML('beforeend', aiReplyHTML);
      DOM.chatStreamBox.scrollTop = DOM.chatStreamBox.scrollHeight;

      this.updateTelemetry(option.analytics);
    }, 1000);
  },

  // Dynamic user query submission
  handleCustomMessageSend() {
    const text = DOM.customUserText.value.trim();
    if (!text) return;

    DOM.customUserText.value = '';

    const userMsgHTML = `
      <div class="chat-bubble-user">
        <span class="sender-label">Caller</span>
        <p>"${text}"</p>
      </div>
    `;
    DOM.chatStreamBox.insertAdjacentHTML('beforeend', userMsgHTML);
    DOM.chatStreamBox.scrollTop = DOM.chatStreamBox.scrollHeight;

    setTimeout(() => {
      let smartReply = "I have noted your custom request. Let me synchronize these parameters and secure your callback details immediately.";
      let customAnalytics = {
        sentiment: "Cooperative",
        leadScore: 45,
        summary: "• Custom inquiry processed:\n " + text,
        fields: { requirement: text.substring(0, 20) + "..." }
      };

      const lower = text.toLowerCase();
      if (lower.includes('price') || lower.includes('cost') || lower.includes('fee') || lower.includes('budget')) {
        smartReply = "Our platform plans range dynamically based on daily conversation volumes. I can alert our operations desk to send you our full document brochure.";
        customAnalytics.sentiment = "Positive";
        customAnalytics.leadScore = 65;
        customAnalytics.fields.requirement = "Pricing parameters";
      } else if (lower.includes('appointment') || lower.includes('book') || lower.includes('visit')) {
        smartReply = "I'll be happy to lock in that calendar slot! Please register your administrator credentials below so I can sync this onto your active dashboard telemetry.";
        customAnalytics.sentiment = "High Intent";
        customAnalytics.leadScore = 80;
        customAnalytics.fields.requirement = "Booking request";
      }

      const aiReplyHTML = `
        <div class="chat-bubble-ai">
          <span class="sender-label">AI Receptionist</span>
          <p>${smartReply}</p>
        </div>
      `;
      DOM.chatStreamBox.insertAdjacentHTML('beforeend', aiReplyHTML);
      DOM.chatStreamBox.scrollTop = DOM.chatStreamBox.scrollHeight;

      this.updateTelemetry(customAnalytics);
    }, 1000);
  },

  // Updates telemetry values inside widgets
  updateTelemetry(analytics) {
    if (!analytics) return;

    // Sentiment Update
    DOM.sentimentText.textContent = analytics.sentiment;
    const lowerSent = analytics.sentiment.toLowerCase();
    
    if (lowerSent.includes('urgent') || lowerSent.includes('frustrated') || lowerSent.includes('hot')) {
      DOM.sentimentIcon.setAttribute('data-lucide', 'alert-triangle');
      DOM.sentimentIcon.style.color = '#ef4444';
    } else {
      DOM.sentimentIcon.setAttribute('data-lucide', 'smile');
      DOM.sentimentIcon.style.color = 'var(--accent-emerald)';
    }
    if (window.lucide) window.lucide.createIcons();

    // Progression score bar
    const score = analytics.leadScore;
    DOM.leadScoreProgressBar.style.width = `${score}%`;
    DOM.leadScoreText.textContent = `${score}%`;

    // Toggle temperature pills
    DOM.tempIndicatorCold.classList.remove('active');
    DOM.tempIndicatorWarm.classList.remove('active');
    DOM.tempIndicatorHot.classList.remove('active');

    if (score < 40) {
      DOM.tempIndicatorCold.classList.add('active');
    } else if (score >= 40 && score < 75) {
      DOM.tempIndicatorWarm.classList.add('active');
    } else {
      DOM.tempIndicatorHot.classList.add('active');
    }

    // Capture fields
    if (analytics.fields) {
      if (analytics.fields.name) DOM.crmCapturedName.textContent = analytics.fields.name;
      if (analytics.fields.phone) DOM.crmCapturedPhone.textContent = analytics.fields.phone;
      if (analytics.fields.requirement) DOM.crmCapturedReq.textContent = analytics.fields.requirement;
      if (analytics.fields.budget) DOM.crmCapturedBudget.textContent = analytics.fields.budget;
    }

    // Call summary block update
    if (analytics.summary) {
      DOM.liveCallSummaryBox.innerHTML = analytics.summary.replace(/\n/g, '<br>');
    }
  },

  // ROI Calculator Calculations Engine
  calculateROI() {
    const monthlyCalls = parseInt(DOM.callsRange.value);
    const hourlyRate = parseInt(DOM.hoursRange.value);
    const missedRate = parseInt(DOM.missedCallsRange.value);

    // Projected calculations
    const hoursSaved = Math.round((monthlyCalls * 4.5) / 60);
    const costPhysicalEmployee = hoursSaved * hourlyRate;
    const platformLicenseCost = 199 + (monthlyCalls * 0.12);
    const netSavings = Math.max(0, Math.round(costPhysicalEmployee - platformLicenseCost));

    const missedCount = (monthlyCalls * (missedRate / 100));
    const leadsRecovered = Math.round(missedCount * 0.8);

    DOM.roiSavingsCalc.textContent = `$${netSavings.toLocaleString()}`;
    DOM.roiHoursSaved.textContent = `${hoursSaved} Hrs`;
    DOM.roiLeadsSaved.textContent = `${leadsRecovered} Leads`;
  },

  // Showcase Console Updates
  updateDynamicShowcaseScreen(industry) {
    const titleEl = document.getElementById('v-showcase-title');
    const pillEl = document.getElementById('v-showcase-pill');
    const descEl = document.getElementById('v-showcase-desc');
    const lbl1 = document.getElementById('v-stat-lbl-1');
    const val1 = document.getElementById('v-stat-val-1');
    const fill1 = document.getElementById('v-stat-fill-1');
    const lbl2 = document.getElementById('v-stat-lbl-2');
    const val2 = document.getElementById('v-stat-val-2');
    const fill2 = document.getElementById('v-stat-fill-2');

    if (industry === 'healthcare') {
      titleEl.textContent = "Healthcare Engine Active";
      pillEl.textContent = "HIPAA Verified";
      pillEl.className = "status-pill green";
      descEl.textContent = "Secure clinical pipeline integrated with medical booking system.";
      lbl1.textContent = "Patient Slot Booking Automation";
      val1.textContent = "98.2% Success";
      fill1.style.width = "98.2%";
      lbl2.textContent = "Clinical FAQ Answering Accuracy";
      val2.textContent = "99.7% Score";
      fill2.style.width = "99.7%";
    } else if (industry === 'recruitment') {
      titleEl.textContent = "Recruitment Agent Online";
      pillEl.textContent = "Recrui8 Synchronized";
      pillEl.className = "status-pill green";
      descEl.textContent = "Vetting candidates profiles, booking screening interviews.";
      lbl1.textContent = "ATS System Scheduling Loops";
      val1.textContent = "94.8% Active";
      fill1.style.width = "94.8%";
      lbl2.textContent = "Candidate Data Scoring Fidelity";
      val2.textContent = "97.5% Score";
      fill2.style.width = "97.5%";
    } else if (industry === 'realestate') {
      titleEl.textContent = "Real Estate Broker Active";
      pillEl.textContent = "CRM Link Active";
      pillEl.className = "status-pill green";
      descEl.textContent = "Auto-distributing phase property plans and brochure files.";
      lbl1.textContent = "Site-Visit Appointment Locks";
      val1.textContent = "91.1% Complete";
      fill1.style.width = "91.1%";
      lbl2.textContent = "Client Intent Profiling precision";
      val2.textContent = "96.4% Correct";
      fill2.style.width = "96.4%";
    } else if (industry === 'education') {
      titleEl.textContent = "Admissions Counselor AI";
      pillEl.textContent = "Intake Verified";
      pillEl.className = "status-pill green";
      descEl.textContent = "Assisting student query paths regarding semesters and scholarships.";
      lbl1.textContent = "Intake Auto-Query Resolution";
      val1.textContent = "96.7% Resolved";
      fill1.style.width = "96.7%";
      lbl2.textContent = "Course Tuition Calculator precision";
      val2.textContent = "99.9% Perfect";
      fill2.style.width = "99.9%";
    }
  },

  // Synthesize custom voice cloning preview
  simulateVoiceCloning() {
    if (AppState.cloningState === 'recording') return;

    AppState.cloningState = 'recording';
    DOM.startVoiceCloneBtn.classList.add('disabled');
    DOM.startVoiceCloneBtn.textContent = 'Recording Timbre Sample...';
    DOM.voiceWaves.classList.add('recording');
    DOM.cloningStatusMsg.innerHTML = '<span style="color: #ef4444;">🎙️ Recording voice stream parameters. Capturing acoustic markers...</span>';

    let seconds = 0;
    const interval = setInterval(() => {
      seconds++;
      DOM.cloningTimer.textContent = `00:0${seconds}`;
      if (seconds >= 4) {
        clearInterval(interval);
        
        AppState.cloningState = 'completed';
        DOM.voiceWaves.classList.remove('recording');
        DOM.startVoiceCloneBtn.textContent = 'Voice Synthesized!';
        DOM.startVoiceCloneBtn.style.backgroundColor = 'var(--accent-emerald)';
        DOM.playClonedBtn.classList.remove('disabled');
        DOM.cloningStatusMsg.innerHTML = '<span style="color: var(--accent-emerald);">✅ Training complete. Audio blueprint compiled. Click "Audit Synthesized Voice" to preview.</span>';
      }
    }, 1000);
  },

  // Audio Playback simulation triggers
  simulateVoiceClonedPlayback() {
    if (AppState.cloningState !== 'completed') return;

    DOM.playClonedBtn.textContent = "Streaming Synth Sample...";
    DOM.voiceWaves.classList.add('recording');
    
    setTimeout(() => {
      DOM.playClonedBtn.textContent = "Audit Synthesized Voice";
      DOM.voiceWaves.classList.remove('recording');
      alert("🎵 Voice Synthesizer Output: 'Hello and welcome. This is a secure preview of your custom synthetic voice. This model is ready to route inbound hotlines.'");
    }, 2500);
  },

  // Handles registration lead form details push to telemetry
  handleLeadFormSubmit() {
    const nameVal = DOM.clientName.value;
    const phoneVal = DOM.clientPhone.value;
    const industryVal = DOM.clientIndustry.options[DOM.clientIndustry.selectedIndex].text;
    const budgetVal = DOM.clientBudget.options[DOM.clientBudget.selectedIndex].text;

    AppState.capturedData = {
      name: nameVal,
      phone: phoneVal,
      requirement: `Briefing: ${industryVal}`,
      budget: budgetVal
    };

    // Update Telemetry log display values
    this.updateTelemetry({
      sentiment: "Hot Lead 🔥",
      leadScore: 98,
      summary: `• Client ${nameVal} submitted parameter profile.\n• Transferred operational parameters directly into sandbox CRM arrays.`,
      fields: AppState.capturedData
    });

    DOM.formSuccessAlert.classList.remove('hidden');

    // Smooth scroll user to simulator to inspect captured logs
    setTimeout(() => {
      const target = document.getElementById('interactive-simulator');
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    }, 1200);
  }
};

// 4. TRIGGER WEB DEMO OPTIONS FROM HERO CONSOLE
function triggerWebDemoOption(type) {
  const replyBox = document.getElementById('web-demo-reply');
  if (type === 'pricing') {
    replyBox.innerHTML = `<strong>iReceptionist System:</strong> "Licensing starts at $199/month for starter slots, scaling up for multi-line enterprise centers."`;
  } else if (type === 'hours') {
    replyBox.innerHTML = `<strong>iReceptionist System:</strong> "The platform guarantees a 99.99% connection uptime with redundant server networks."`;
  } else if (type === 'human') {
    replyBox.innerHTML = `<strong>iReceptionist System:</strong> "Acknowledged. Please submit your specifications below, or a clinical briefing director will follow up."`;
  }
}

// 5. INITIALIZE PLATFORM APP
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});