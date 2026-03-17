'use client';

import { motion } from 'motion/react';

type HeaderProps = {
  title: string;
  onLogout: () => void;
};

export function Header({ title, onLogout }: HeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="border-b border-(--panel-border) bg-white/80 px-4 py-4 backdrop-blur-md sm:px-6"
    >
      <div className="mx-auto max-w-6xl overflow-hidden rounded-b-3xl border border-(--panel-border) bg-(--panel) px-5 py-4 shadow-[0_10px_35px_rgba(30,41,59,0.12)] sm:px-6">
        <div className="flex h-14 items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--muted)">
              WhatsApp Bot
            </p>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border border-(--panel-border) bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
          >
            Logout
          </button>
        </div>
      </div>
    </motion.header>
  );
}
