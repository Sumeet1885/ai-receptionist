"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
import { Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
export function VoiceInput({ className, onStart, onStop, listening, setListening, ...props }) {
    const [_listening, _setListening] = React.useState(false);
    const [_time, _setTime] = React.useState(0);
    const activeListening = listening !== undefined ? listening : _listening;
    const activeSetListening = setListening !== undefined ? setListening : _setListening;
    React.useEffect(() => {
        let intervalId;
        if (activeListening) {
            onStart?.();
            intervalId = setInterval(() => {
                _setTime((t) => t + 1);
            }, 1000);
        }
        else {
            onStop?.();
            _setTime(0);
        }
        return () => clearInterval(intervalId);
    }, [activeListening]);
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };
    const onClickHandler = () => {
        activeSetListening(!activeListening);
    };
    return (_jsx("div", { className: cn("flex flex-col items-center justify-center", className), ...props, children: _jsxs(motion.div, { className: "flex p-2 border border-brand-border items-center justify-center rounded-full cursor-pointer bg-brand-bg text-brand-text hover:bg-brand-card transition-colors", layout: true, transition: {
                layout: {
                    duration: 0.4,
                },
            }, onClick: onClickHandler, children: [_jsx("div", { className: "h-6 w-6 items-center justify-center flex ", children: activeListening ? (_jsx(motion.div, { className: "w-4 h-4 bg-brand-accent rounded-sm", animate: {
                            rotate: [0, 180, 360],
                        }, transition: {
                            duration: 2,
                            repeat: Number.POSITIVE_INFINITY,
                            ease: "easeInOut",
                        } })) : (_jsx(Mic, { className: "w-5 h-5 text-brand-accent" })) }), _jsx(AnimatePresence, { mode: "wait", children: activeListening && (_jsxs(motion.div, { initial: { opacity: 0, width: 0, marginLeft: 0 }, animate: { opacity: 1, width: "auto", marginLeft: 8 }, exit: { opacity: 0, width: 0, marginLeft: 0 }, transition: {
                            duration: 0.4,
                        }, className: "overflow-hidden flex gap-2 items-center justify-center", children: [_jsx("div", { className: "flex gap-0.5 items-center justify-center", children: [...Array(12)].map((_, i) => (_jsx(motion.div, { className: "w-0.5 bg-brand-accent rounded-full", initial: { height: 2 }, animate: {
                                        height: activeListening
                                            ? [2, 3 + Math.random() * 10, 3 + Math.random() * 5, 2]
                                            : 2,
                                    }, transition: {
                                        duration: activeListening ? 1 : 0.3,
                                        repeat: activeListening ? Infinity : 0,
                                        delay: activeListening ? i * 0.05 : 0,
                                        ease: "easeInOut",
                                    } }, i))) }), _jsx("div", { className: "text-xs text-brand-muted w-10 text-center font-mono", children: formatTime(_time) })] })) })] }) }));
}
