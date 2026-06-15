import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icons } from '../common/Icons';
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const mapRange = (value, inputMin, inputMax, outputMin, outputMax) => {
    const progress = clamp((value - inputMin) / (inputMax - inputMin));
    return outputMin + (outputMax - outputMin) * progress;
};
const channels = [
    { name: 'Voice calls', detail: 'Answers inbound calls, asks questions, and books appointments.' },
    { name: 'WhatsApp', detail: 'Replies instantly to quotations, follow-ups, and basic queries.' },
    { name: 'Website chat', detail: 'Same AI agent available on every landing page and campaign.' }
];
const industries = [
    { name: 'Healthcare', detail: 'Doctor timings, fees, location, and appointment booking.' },
    { name: 'Recruitment', detail: 'Job openings, interview status, and application tracking.' },
    { name: 'Real estate', detail: 'Property details, pricing, and site visit scheduling.' },
    { name: 'Education', detail: 'Admissions, course details, batches, and fee structure.' }
];
const aiFeatures = ['Call summary', 'Sentiment analysis', 'Lead scoring', 'Voice cloning'];
const storyCount = 6;
export const LandingView = ({ setView, setActiveBotId, applyOnboardingTemplate, launchPublicChat, user }) => {
    const sectionRef = useRef(null);
    const [scrollProgress, setScrollProgress] = useState(0);
    useEffect(() => {
        let frame = 0;
        const updateProgress = () => {
            if (!sectionRef.current)
                return;
            const rect = sectionRef.current.getBoundingClientRect();
            const scrollable = Math.max(1, sectionRef.current.offsetHeight - window.innerHeight);
            setScrollProgress(clamp(-rect.top / scrollable));
        };
        const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updateProgress);
        };
        updateProgress();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, []);
    const motion = useMemo(() => {
        const p = scrollProgress;
        return {
            greenOpacity: mapRange(p, 0.05, 0.16, 0, 1),
            heroOpacity: mapRange(p, 0.03, 0.13, 1, 0),
            heroY: mapRange(p, 0, 0.22, 0, -64),
            heroScale: mapRange(p, 0, 0.18, 1, 0.94),
            deviceY: mapRange(p, 0, 0.16, 300, -132),
            deviceScale: mapRange(p, 0, 0.16, 0.78, 1),
            panelY: mapRange(p, 0.04, 0.16, 92, 0),
            storyStackY: -mapRange(p, 0.18, 0.82, 0, storyCount - 1) * 100
        };
    }, [scrollProgress]);
    const createBot = () => {
        setView('onboarding');
        applyOnboardingTemplate('Education');
    };
    const openDashboard = () => {
        setActiveBotId('apex-academy');
        setView('dashboard');
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { ref: sectionRef, className: "landing-cinema landing-product-cinema", children: [_jsxs("section", { className: "landing-sticky-stage", children: [_jsx("div", { className: "landing-emerald-field", style: { opacity: motion.greenOpacity }, "aria-hidden": "true" }), _jsxs("div", { className: "landing-hero-copy landing-product-hero", style: {
                                    opacity: motion.heroOpacity,
                                    transform: `translate3d(0, ${motion.heroY}px, 0) scale(${motion.heroScale})`
                                }, children: [_jsxs("span", { className: "landing-kicker", children: [_jsx(Icons.Sparkles, {}), "Virtual employee available 24x7"] }), _jsxs("h1", { children: ["Meet your", _jsx("br", {}), "always-on", _jsx("br", {}), _jsx("span", { className: "landing-fingerprint", children: "AI" }), " Receptionist"] }), _jsx("p", { children: "One AI agent that answers calls, replies on WhatsApp, chats on your website, books appointments, captures leads, and pushes every detail to your CRM." }), _jsx("button", { className: "landing-primary-cta", onClick: () => user ? setView('dashboard') : setView('auth-signup'), children: "Create your receptionist" })] }), _jsxs("div", { className: "landing-device landing-product-device", style: {
                                    transform: `translate3d(-50%, ${motion.deviceY}px, 0) scale(${motion.deviceScale})`
                                }, children: [_jsxs("div", { className: "landing-device-top", children: [_jsxs("div", { className: "landing-mini-brand", children: ["I Receptionist", _jsx("span", { children: ".ai" })] }), _jsxs("div", { className: "landing-mini-nav", children: [_jsx("span", { children: "Voice" }), _jsx("span", { children: "WhatsApp" }), _jsx("span", { children: "Website" }), _jsx("span", { children: "CRM" })] }), _jsx("button", { onClick: openDashboard, children: "Console" })] }), _jsx("div", { className: "landing-white-panel landing-product-panel", style: {
                                            transform: `translate3d(0, ${motion.panelY}px, 0)`
                                        }, children: _jsxs("div", { className: "landing-scene-stack", style: { transform: `translate3d(0, ${motion.storyStackY}%, 0)` }, children: [_jsxs("section", { className: "landing-story-panel landing-call-section", children: [_jsxs("div", { className: "landing-prompt-pill", children: [_jsx("span", { children: "Customer calls: \"I want to book an appointment.\"" }), _jsxs("div", { children: [_jsx("button", { onClick: () => launchPublicChat('apex-academy'), children: "Try" }), _jsx("button", { onClick: createBot, children: "Deploy" })] })] }), _jsx("span", { className: "landing-section-eyebrow", children: "What it does" }), _jsxs("h2", { children: ["Answers calls ", _jsx("span", { children: "automatically" })] }), _jsx("p", { children: "It understands natural language, asks the right follow-up questions, and turns a call into an appointment or qualified lead." }), _jsx("div", { className: "landing-language-strip", children: ['English', 'Hindi', 'Marathi', 'Tamil', 'Multiple languages'].map(language => (_jsx("span", { children: language }, language))) }), _jsxs("div", { className: "landing-call-stage", children: [_jsxs("article", { className: "landing-call-bubble landing-customer-bubble", children: [_jsx("span", { children: "Customer" }), _jsx("strong", { children: "I want to book an appointment." })] }), _jsxs("article", { className: "landing-call-bubble landing-ai-bubble", children: [_jsx("span", { children: "AI Receptionist" }), _jsx("strong", { children: "Certainly. May I know your preferred date and time?" })] })] })] }), _jsxs("section", { className: "landing-story-panel landing-channel-section", children: [_jsx("span", { className: "landing-section-eyebrow", children: "One agent everywhere" }), _jsxs("h2", { children: ["Voice + WhatsApp + Website ", _jsx("span", { children: "unified" })] }), _jsx("p", { children: "Customers can call, message, or chat. The same receptionist keeps context and pushes structured data into Google Calendar, Outlook, and CRM." }), _jsx("div", { className: "landing-channel-grid", children: channels.map(channel => (_jsxs("article", { className: "landing-channel-card", children: [_jsx("span", { children: channel.name }), _jsx("p", { children: channel.detail })] }, channel.name))) }), _jsxs("div", { className: "landing-integration-rail", children: [_jsx("span", { children: "Google Calendar" }), _jsx("span", { children: "Outlook" }), _jsx("span", { children: "CRM" })] })] }), _jsxs("section", { className: "landing-story-panel landing-crm-section", children: [_jsxs("div", { className: "landing-lead-copy", children: [_jsx("span", { className: "landing-section-eyebrow", children: "Lead capture" }), _jsxs("h2", { children: ["Every inquiry becomes a ", _jsx("span", { children: "CRM-ready lead" })] }), _jsx("p", { children: "Name, phone, requirement, budget, appointment status, and sentiment are captured automatically." })] }), _jsxs("div", { className: "landing-product-crm-card", children: [['Name', 'Phone', 'Requirement', 'Budget'].map(field => (_jsxs("div", { children: [_jsx("span", { children: field }), _jsx("strong", { children: field === 'Name' ? 'Amit Deshmukh' : field === 'Phone' ? '+91 98812 34567' : field === 'Requirement' ? 'Admission callback' : 'Flexible' })] }, field))), _jsx("p", { children: "Summary: High-intent visitor asked for course details and requested a callback." })] })] }), _jsxs("section", { className: "landing-story-panel landing-industry-section", children: [_jsx("span", { className: "landing-section-eyebrow", children: "Industry-specific versions" }), _jsxs("h2", { children: ["Built for the front desk your ", _jsx("span", { children: "business actually has" })] }), _jsx("div", { className: "landing-industry-grid", children: industries.map(industry => (_jsxs("article", { className: "landing-industry-card", children: [_jsx("span", { children: industry.name }), _jsx("p", { children: industry.detail })] }, industry.name))) })] }), _jsxs("section", { className: "landing-story-panel landing-intelligence-section", children: [_jsx("span", { className: "landing-section-eyebrow", children: "AI features" }), _jsxs("h2", { children: ["Summaries, sentiment, scoring, and ", _jsx("span", { children: "branded voice" })] }), _jsx("p", { children: "Detect angry customers, urgent issues, high-value leads, hot/warm/cold intent, and call outcomes without asking staff to listen to every recording." }), _jsx("div", { className: "landing-ai-feature-grid", children: aiFeatures.map(feature => (_jsx("article", { children: _jsx("span", { children: feature }) }, feature))) })] }), _jsxs("section", { className: "landing-story-panel landing-product-dark-story landing-final-story", children: [_jsxs("div", { children: [_jsxs("h2", { children: [_jsx("span", { children: "One AI employee" }), " handling every first response"] }), _jsx("p", { children: "Calls, WhatsApp, and website chats become booked appointments, CRM leads, call summaries, sentiment signals, and follow-ups." }), _jsx("button", { onClick: createBot, children: "Configure your AI receptionist" })] }), _jsxs("div", { className: "landing-floating-bubble landing-floating-bubble-a", children: [_jsx("span", { children: "Sentiment" }), _jsx("strong", { children: "Urgent issue detected" })] }), _jsxs("div", { className: "landing-floating-bubble landing-floating-bubble-b", children: [_jsx("span", { children: "Lead score" }), _jsx("strong", { children: "HOT lead pushed to CRM" })] })] })] }) })] })] }), _jsx("div", { className: "landing-scroll-spacer", "aria-hidden": "true" })] }), _jsxs("footer", { className: "landing-site-footer", children: [_jsxs("div", { children: [_jsx("span", { children: "Receptionist.ai" }), _jsx("p", { children: "One 24x7 AI receptionist for calls, WhatsApp, website chat, bookings, summaries, and CRM handoff." })] }), _jsxs("nav", { "aria-label": "Footer", children: [_jsx("button", { onClick: createBot, children: "Configure Agent" }), _jsx("button", { onClick: openDashboard, children: "Open Console" }), _jsx("button", { onClick: () => launchPublicChat('apex-academy'), children: "Try Live Agent" })] })] })] }));
};
