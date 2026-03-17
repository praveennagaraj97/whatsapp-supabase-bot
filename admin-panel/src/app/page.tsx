'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { AuthView } from '@/components/auth/auth-view';
import { ProjectsView } from '@/components/projects/projects-view';
import { STORAGE_KEYS } from '@/constants/api-routes';
import { useProjects } from '@/hooks/api/use-projects';

function getToken(): string {
  return localStorage.getItem(STORAGE_KEYS.adminToken) || '';
}

function clearToken(): void {
  localStorage.removeItem(STORAGE_KEYS.adminToken);
}

export default function Home() {
  const [token, setToken] = useState<string>(() =>
    typeof window === 'undefined' ? '' : getToken(),
  );

  const isAuthed = Boolean(token);
  const { data, error, isLoading, mutate: swrMutate } = useProjects(isAuthed);

  const projects = useMemo(() => data?.projects || [], [data?.projects]);

  // Wrap SWR mutate to match the expected type
  const mutate = async () => {
    await swrMutate();
  };

  function handleLogout() {
    clearToken();
    setToken('');
  }

  return (
    <main
      suppressHydrationWarning
      className="relative isolate min-h-screen overflow-hidden"
    >
      <div className="pointer-events-none absolute -left-40 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute -right-32 bottom-12 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.2),transparent_70%)]" />

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {!isAuthed ? (
            <motion.div
              key="login"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-screen items-center justify-center px-5 py-16 sm:px-8"
            >
              <AuthView onLoginSuccess={setToken} />
            </motion.div>
          ) : isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-screen items-center justify-center"
            >
              <p className="text-(--muted) text-sm">Loading projects...</p>
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-screen items-center justify-center px-6"
            >
              <div className="rounded-2xl border border-red-300/80 bg-red-50 px-8 py-10 text-center">
                <p className="text-sm text-red-700">Failed to load projects</p>
              </div>
            </motion.div>
          ) : (
            <ProjectsView
              key="projects"
              projects={projects}
              onLogout={handleLogout}
              mutate={mutate}
            />
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
