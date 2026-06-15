import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';
export const Header = ({ view, setView, user }) => {
    const isLanding = view === 'landing';
    const handleSignInGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                scopes: 'https://www.googleapis.com/auth/calendar',
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });
    };
    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };
    return (_jsxs("header", { className: `sticky top-0 z-40 backdrop-blur-md px-6 flex items-center justify-between ${isLanding
            ? 'bg-black/95 border-b border-white/10 py-3'
            : 'bg-brand-bg/90 border-b border-brand-border py-4'}`, children: [_jsxs("div", { className: "flex items-center space-x-3 cursor-pointer", onClick: () => setView('landing'), children: [_jsx("div", { className: `p-2 border rounded-lg shadow-sm transition hover:scale-105 ${isLanding
                            ? 'bg-white/5 border-white/10 text-emerald-400'
                            : 'bg-brand-accent/10 border-brand-border text-brand-accent'}`, children: _jsx(Icons.Bot, {}) }), _jsxs("div", { children: [_jsxs("h1", { className: "text-xl font-display font-extrabold tracking-tight text-brand-text", children: ["Receptionist", _jsx("span", { className: isLanding ? 'text-emerald-400' : 'text-brand-accent', children: ".ai" })] }), _jsx("p", { className: "text-[10px] text-brand-muted font-mono tracking-wider uppercase font-semibold", children: "Enterprise Agent Portal" })] })] }), _jsxs("nav", { className: "hidden md:flex items-center space-x-6 text-sm font-sans font-medium", children: [_jsx("button", { onClick: () => setView('landing'), className: `hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'landing' ? `text-brand-text ${isLanding ? 'border-emerald-400' : 'border-brand-accent'} font-semibold` : 'text-brand-muted border-transparent'}`, children: "Features" }), user && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setView('onboarding'), className: `hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'onboarding' ? 'text-brand-text border-brand-accent font-semibold' : 'text-brand-muted border-transparent'}`, children: "Configure Agent" }), _jsx("button", { onClick: () => setView('dashboard'), className: `hover:text-brand-text transition-colors duration-200 pb-1 border-b-2 ${view === 'dashboard' ? 'text-brand-text border-brand-accent font-semibold' : 'text-brand-muted border-transparent'}`, children: "Console" })] }))] }), _jsx("div", { className: "flex items-center space-x-4", children: user ? (_jsxs("div", { className: "flex items-center space-x-4", children: [_jsx("span", { className: "text-sm text-brand-muted hidden sm:inline-block", children: user.email }), _jsx("button", { onClick: handleSignOut, className: `px-4 py-2 font-sans font-semibold text-sm rounded-lg shadow-sm transition duration-200 border ${isLanding
                                ? 'border-white/10 hover:bg-white/5 text-white'
                                : 'border-brand-border hover:bg-brand-card text-brand-text'}`, children: "Sign Out" })] })) : (_jsxs("div", { className: "flex items-center space-x-3", children: [_jsx("button", { onClick: () => setView('auth-signin'), className: `px-4 py-2 font-sans font-semibold text-sm rounded-lg transition duration-200 ${isLanding ? 'text-brand-muted hover:text-white' : 'text-brand-muted hover:text-brand-text'}`, children: "Sign In" }), _jsx("button", { onClick: () => setView('auth-signup'), className: `px-4 py-2 font-sans font-semibold text-sm rounded-lg shadow-md hover:shadow-lg transition duration-200 ${isLanding
                                ? 'bg-emerald-400 hover:bg-emerald-300 text-black'
                                : 'bg-brand-accent hover:bg-brand-accent-hover text-brand-text'}`, children: "Create an account" })] })) })] }));
};
