import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Icons } from './Icons';
export const Toast = ({ toast }) => {
    return (_jsxs("div", { className: "fixed top-5 right-5 z-50 flex items-center p-4 rounded-xl shadow-2xl bg-brand-card border border-brand-border border-l-4 border-l-brand-accent text-brand-text animate-bounce max-w-sm", children: [_jsx("div", { className: "text-brand-accent shrink-0", children: _jsx(Icons.Bot, {}) }), _jsx("span", { className: "ml-3 text-sm font-sans font-semibold", children: toast.message })] }));
};
