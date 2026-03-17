'use client';

import { AxiosError } from 'axios';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { API_CONFIG, STORAGE_KEYS } from '@/constants/api-routes';
import { useProjects } from '@/hooks/api/use-projects';
import { authService } from '@/services/api/auth-service';
import type { LoginRequest, Project } from '@/types/api';

type AuthViewProps = {
  onLoginSuccess: (token: string) => void;
};

type ProjectsViewProps = {
  projects: Project[];
  onLogout: () => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const message =
      typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : error.message;
    return message || 'Request failed. Please try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function saveToken(token: string): void {
  localStorage.setItem(STORAGE_KEYS.adminToken, token);
}

function getToken(): string {
  return localStorage.getItem(STORAGE_KEYS.adminToken) || '';
}

function clearToken(): void {
  localStorage.removeItem(STORAGE_KEYS.adminToken);
}

function AuthView({ onLoginSuccess }: AuthViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isSubmitDisabled = !email.trim() || !password.trim() || isLoading;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const payload: LoginRequest = {
        email: email.trim().toLowerCase(),
        password: password.trim(),
      };

      const response = await authService.login(payload);
      if (!response.token) {
        throw new Error('Login succeeded but no token was returned.');
      }

      saveToken(response.token);
      onLoginSuccess(response.token);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <motion.section
      key="auth"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-md rounded-3xl border border-(--panel-border) bg-(--panel) p-8 shadow-[0_16px_64px_rgba(3,13,24,0.18)]"
    >
      <p className="text-(--muted) text-xs font-medium uppercase tracking-[0.28em]">
        Admin
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        Login
      </h1>
      <p className="text-(--muted) mt-2 text-sm">
        Sign in to manage bot projects and prompt configuration.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-(--muted) mb-2 block text-xs font-medium uppercase tracking-[0.2em]">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-2xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
            placeholder="admin@mail.com"
            required
          />
        </label>

        <label className="block">
          <span className="text-(--muted) mb-2 block text-xs font-medium uppercase tracking-[0.2em]">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-2xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
            placeholder="••••••••"
            required
          />
        </label>

        {error ? (
          <p className="rounded-2xl border border-red-300/70 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="mt-2 inline-flex w-full items-center justify-center rounded-2xl bg-foreground px-4 py-3 text-sm font-medium text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? 'Signing in...' : 'Continue'}
        </button>

        {!API_CONFIG.baseUrl ? (
          <p className="text-xs text-amber-700">
            Set NEXT_PUBLIC_ADMIN_API_BASE_URL to your admin function URL.
          </p>
        ) : null}
      </form>
    </motion.section>
  );
}

function ProjectsView({ projects, onLogout }: ProjectsViewProps) {
  return (
    <motion.section
      key="projects"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="w-full max-w-4xl rounded-3xl border border-(--panel-border) bg-(--panel) p-8 shadow-[0_16px_64px_rgba(3,13,24,0.18)]"
    >
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-(--muted) text-xs font-medium uppercase tracking-[0.28em]">
            Workspace
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            Projects
          </h1>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center justify-center rounded-2xl border border-(--panel-border) px-4 py-2 text-sm text-foreground transition hover:border-(--accent)"
        >
          Logout
        </button>
      </header>

      <motion.ul
        className="mt-8 space-y-3"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: {
              staggerChildren: 0.07,
            },
          },
        }}
      >
        {projects.map((project) => (
          <motion.li
            key={project.id}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: { opacity: 1, y: 0 },
            }}
            className="rounded-2xl border border-(--panel-border) bg-white/80 px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-medium text-foreground">
                  {project.name}
                </p>
                <p className="text-(--muted) mt-1 text-sm">{project.slug}</p>
              </div>

              {project.is_enabled ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                  Enabled
                </span>
              ) : (
                <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600">
                  Disabled
                </span>
              )}
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </motion.section>
  );
}

export default function Home() {
  const [token, setToken] = useState<string>(() =>
    typeof window === 'undefined' ? '' : getToken(),
  );

  const isAuthed = Boolean(token);
  const { data, error, isLoading } = useProjects(isAuthed);

  const projects = useMemo(() => data?.projects || [], [data?.projects]);

  function handleLogout() {
    clearToken();
    setToken('');
  }

  return (
    <main className="relative isolate min-h-screen overflow-hidden px-5 py-16 sm:px-8">
      <div className="pointer-events-none absolute -left-40 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.22),transparent_70%)]" />
      <div className="pointer-events-none absolute -right-32 bottom-12 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.2),transparent_70%)]" />

      <div className="mx-auto flex min-h-[78vh] w-full max-w-6xl items-center justify-center">
        <AnimatePresence mode="wait">
          {!isAuthed ? (
            <AuthView key="login" onLoginSuccess={setToken} />
          ) : (
            <motion.div key="projects-wrap" className="w-full">
              {isLoading ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mx-auto w-full max-w-2xl rounded-3xl border border-(--panel-border) bg-(--panel) px-8 py-12 text-center"
                >
                  <p className="text-(--muted) text-sm">Loading projects...</p>
                </motion.div>
              ) : error ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mx-auto w-full max-w-2xl rounded-3xl border border-red-300/80 bg-red-50 px-8 py-10 text-center"
                >
                  <p className="text-sm text-red-700">
                    {getErrorMessage(error)}
                  </p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-4 rounded-xl border border-red-300 px-3 py-2 text-xs font-medium text-red-700"
                  >
                    Logout and retry
                  </button>
                </motion.div>
              ) : (
                <ProjectsView projects={projects} onLogout={handleLogout} />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
