import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Bot } from '../../types';
import { Icons } from '../../components/common/Icons';
import { PhoneAgentStatus } from './dograhApi';

interface AgentSelectorDropdownProps {
  bots: Bot[];
  selectedBotId: string | null;
  onSelectBot: (botId: string) => void;
  agentStatus: PhoneAgentStatus | null;
}

export const AgentSelectorDropdown: React.FC<AgentSelectorDropdownProps> = ({
  bots,
  selectedBotId,
  onSelectBot,
  agentStatus,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedBot = useMemo(() => {
    return bots.find(b => b.id === selectedBotId) || bots[0] || null;
  }, [bots, selectedBotId]);

  // Filter bots by search query
  const filteredBots = useMemo(() => {
    if (!searchQuery.trim()) return bots;
    const q = searchQuery.toLowerCase().trim();
    return bots.filter(
      b =>
        b.businessName.toLowerCase().includes(q) ||
        (b.industry && b.industry.toLowerCase().includes(q))
    );
  }, [bots, searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (botId: string) => {
    onSelectBot(botId);
    setIsOpen(false);
  };

  if (!selectedBot) return null;

  return (
    <div
      ref={dropdownRef}
      className="relative bg-brand-card border border-brand-border rounded-2xl p-4 shadow-sm flex flex-col justify-between"
    >
      <div>
        {/* Card Header */}
        <div className="flex items-center justify-between pb-3 border-b border-brand-border">
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-muted flex items-center gap-1.5">
            <Icons.Bot /> Active AI Receptionist
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-brand-bg border border-brand-border text-brand-muted">
            {bots.length} {bots.length === 1 ? 'AGENT' : 'AGENTS'}
          </span>
        </div>

        {/* ── INTERACTIVE ACTIVE AGENT BUTTON (TRIGGER) ── */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className={`w-full text-left p-3 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 group ${
              isOpen
                ? 'bg-brand-accent/15 border-brand-accent ring-2 ring-brand-accent/30 shadow-md'
                : 'bg-brand-bg/60 hover:bg-brand-bg border-brand-border hover:border-brand-accent/50 shadow-sm'
            }`}
          >
            <div className="min-w-0 flex items-center gap-3">
              {/* Avatar Initial */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 shadow-sm transition-transform group-hover:scale-105"
                style={{
                  backgroundColor: selectedBot.primaryColor || '#19e99d',
                  color: '#07110e',
                }}
              >
                {selectedBot.businessName.charAt(0).toUpperCase()}
              </div>

              {/* Business Name & Industry */}
              <div className="truncate min-w-0">
                <span className="block text-sm font-bold truncate text-brand-text group-hover:text-brand-accent transition-colors flex items-center gap-2">
                  <span>{selectedBot.businessName}</span>
                  {selectedBot.agentDirection === 'outbound' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.35)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      Outbound
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.35)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Inbound
                    </span>
                  )}
                </span>
                <span className="block text-xs text-brand-muted truncate mt-0.5">
                  {selectedBot.industry || 'General Business'}
                </span>
              </div>
            </div>

            {/* Dropdown Chevron */}
            <div className="flex items-center gap-2 shrink-0">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-brand-muted group-hover:text-brand-text transition-transform duration-200 ${
                  isOpen ? 'rotate-180 bg-brand-accent/20 text-brand-accent' : 'bg-brand-card'
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Voice Engine & Line Summary */}
      <div className="pt-3 border-t border-brand-border mt-3 flex items-center justify-between text-[11px] text-brand-muted">
        <span className="flex items-center gap-1.5">
          <span>Voice Engine:</span>
          <span
            className={`font-semibold flex items-center gap-1 ${
              agentStatus?.provisioned ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                agentStatus?.provisioned ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            {agentStatus?.provisioned ? 'Live Ready' : 'Setup Required'}
          </span>
        </span>

        {agentStatus?.phoneNumber && (
          <span className="font-body text-[10px] text-brand-muted truncate max-w-[120px]">
            {agentStatus.phoneNumber}
          </span>
        )}
      </div>

      {/* ── FLOATING POPOVER / DROPDOWN MENU (LINEAR / VERCEL STYLE) ── */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl bg-brand-card/95 backdrop-blur-xl border border-brand-accent/40 shadow-2xl ring-1 ring-brand-border/60 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ minWidth: '320px' }}
        >
          {/* Popover Header with Search Input */}
          <div className="p-3 border-b border-brand-border/80 bg-brand-bg/50">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-brand-muted text-xs">
                🔍
              </span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder={`Search ${bots.length} receptionists…`}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-8 rounded-xl bg-brand-card border border-brand-border text-xs text-brand-text placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-brand-muted hover:text-brand-text text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filtered Agent List - Isolated scroll that stops propagation to page */}
          <div
            className="p-2 space-y-1 max-h-64 overflow-y-auto"
            onWheel={e => e.stopPropagation()}
          >
            {filteredBots.length === 0 ? (
              <div className="p-6 text-center text-brand-muted">
                <span className="text-2xl block mb-1">🤖</span>
                <p className="text-xs font-semibold text-brand-text">No receptionists found</p>
                <p className="text-[11px] text-brand-muted mt-0.5">
                  No agents match &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            ) : (
              filteredBots.map(bot => {
                const isSelected = selectedBot.id === bot.id;
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => handleSelect(bot.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-brand-accent/15 text-brand-text border-brand-accent shadow-sm'
                        : 'bg-transparent text-brand-muted border-transparent hover:bg-brand-bg/80 hover:text-brand-text hover:border-brand-border/60'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                          isSelected
                            ? 'shadow-sm'
                            : 'opacity-80'
                        }`}
                        style={{
                          backgroundColor: bot.primaryColor || '#19e99d',
                          color: '#07110e',
                        }}
                      >
                        {bot.businessName.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="truncate min-w-0">
                        <span
                          className={`block text-xs font-bold truncate ${
                            isSelected ? 'text-brand-accent' : 'text-brand-text'
                          } flex items-center gap-1.5`}
                        >
                          <span>{bot.businessName}</span>
                          {bot.agentDirection === 'outbound' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[8px] font-bold uppercase bg-cyan-500/15 border border-cyan-500/40 text-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.3)]">
                              <span className="h-1 w-1 rounded-full bg-cyan-400 animate-pulse" />
                              Outbound
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[8px] font-bold uppercase bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.3)]">
                              <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                              Inbound
                            </span>
                          )}
                        </span>
                        <span className="block text-[10px] text-brand-muted truncate">
                          {bot.industry || 'General Business'}
                        </span>
                      </div>
                    </div>

                    {/* Active Checkmark */}
                    {isSelected ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-accent text-primary-foreground shrink-0 flex items-center gap-1 shadow-sm">
                        ✓ Active
                      </span>
                    ) : (
                      <span className="text-[11px] text-brand-muted hover:text-brand-text opacity-0 hover:opacity-100 transition">
                        Select
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Popover Footer */}
          <div className="p-2.5 bg-brand-bg/70 border-t border-brand-border/60 flex items-center justify-between text-[11px] text-brand-muted">
            <span>
              Showing {filteredBots.length} of {bots.length}
            </span>
            <span className="text-[10px] text-brand-muted">
              Press <kbd className="px-1 py-0.5 bg-brand-card rounded border border-brand-border font-body text-[9px]">ESC</kbd> to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
