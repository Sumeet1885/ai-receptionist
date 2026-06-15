import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Icons } from '../common/Icons';
import { supabase } from '../../lib/supabaseClient';
export const AuthView = ({ setView, showToast, defaultMode = 'signin' }) => {
    const [mode, setMode] = useState(defaultMode);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const handleEmailAuth = async (e) => {
        e.preventDefault();
        if (!email || !password)
            return showToast("Please enter email and password", "error");
        setLoading(true);
        try {
            if (mode === 'signup') {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error)
                    throw error;
                showToast("Account created successfully! Check your email if verification is required.", "success");
            }
            else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error)
                    throw error;
                showToast("Signed in successfully!", "success");
            }
        }
        catch (err) {
            showToast(err.message, "error");
        }
        finally {
            setLoading(false);
        }
    };
    const handleOAuth = async (provider) => {
        if (provider === 'google') {
            await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    scopes: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent'
                    }
                }
            });
        }
        else {
            await supabase.auth.signInWithOAuth({ provider });
        }
    };
    return (_jsxs("div", { className: "flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-black min-h-[calc(100vh-80px)]", children: [_jsx("div", { className: "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-emerald-500/10 blur-[120px] rounded-[100%] pointer-events-none" }), _jsx("div", { className: "w-full max-w-md relative z-10", children: _jsxs("div", { className: "bg-brand-card/80 backdrop-blur-xl border border-brand-border p-8 rounded-2xl shadow-2xl", children: [_jsxs("div", { className: "text-center mb-8", children: [_jsx("h2", { className: "text-3xl font-display font-bold text-brand-text mb-2", children: mode === 'signin' ? 'Welcome back' : 'Create an account' }), _jsx("p", { className: "text-brand-muted", children: mode === 'signin'
                                        ? 'Sign in to access your virtual receptionist console.'
                                        : 'Start building your AI employee today.' })] }), _jsxs("div", { className: "space-y-4 mb-6", children: [_jsxs("button", { onClick: () => handleOAuth('google'), className: "w-full py-3 px-4 bg-white text-black hover:bg-gray-100 rounded-lg font-semibold flex items-center justify-center space-x-3 transition duration-200", children: [_jsx(Icons.Google, {}), _jsx("span", { children: "Continue with Google" })] }), _jsxs("button", { onClick: () => handleOAuth('azure'), className: "w-full py-3 px-4 bg-[#2f2f2f] text-white hover:bg-[#3f3f3f] border border-white/10 rounded-lg font-semibold flex items-center justify-center space-x-3 transition duration-200", children: [_jsx(Icons.Microsoft, {}), _jsx("span", { children: "Continue with Microsoft" })] })] }), _jsxs("div", { className: "flex items-center space-x-4 mb-6", children: [_jsx("div", { className: "flex-1 h-px bg-brand-border" }), _jsx("span", { className: "text-xs text-brand-muted uppercase tracking-wider", children: "or email" }), _jsx("div", { className: "flex-1 h-px bg-brand-border" })] }), _jsxs("form", { onSubmit: handleEmailAuth, className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-brand-text mb-1.5", children: "Email Address" }), _jsx("input", { type: "email", required: true, value: email, onChange: e => setEmail(e.target.value), className: "w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition", placeholder: "name@company.com" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-brand-text mb-1.5", children: "Password" }), _jsx("input", { type: "password", required: true, value: password, onChange: e => setPassword(e.target.value), className: "w-full bg-black border border-brand-border rounded-lg px-4 py-2.5 text-brand-text focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition", placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" })] }), _jsx("button", { type: "submit", disabled: loading, className: "w-full py-3 px-4 bg-emerald-400 hover:bg-emerald-300 text-black font-semibold rounded-lg shadow-md transition duration-200 mt-2 disabled:opacity-50", children: loading ? 'Please wait...' : (mode === 'signin' ? 'Sign In' : 'Create Account') })] }), _jsx("div", { className: "mt-6 text-center text-sm text-brand-muted", children: mode === 'signin' ? (_jsxs("p", { children: ["Don't have an account? ", _jsx("button", { onClick: () => setMode('signup'), className: "text-emerald-400 hover:underline font-medium", children: "Sign up" })] })) : (_jsxs("p", { children: ["Already have an account? ", _jsx("button", { onClick: () => setMode('signin'), className: "text-emerald-400 hover:underline font-medium", children: "Sign in" })] })) })] }) })] }));
};
