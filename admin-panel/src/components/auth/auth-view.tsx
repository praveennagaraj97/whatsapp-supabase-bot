'use client';

import { AxiosError } from 'axios';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';

import { API_CONFIG, STORAGE_KEYS } from '@/constants/api-routes';
import { authService } from '@/services/api/auth-service';
import type { LoginRequest } from '@/types/api';

type AuthViewProps = {
  onLoginSuccess: (token: string) => void;
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

export function AuthView({ onLoginSuccess }: AuthViewProps) {
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
      toast.success('Logged in successfully');
      onLoginSuccess(response.token);
    } catch (requestError) {
      const errorMsg = getErrorMessage(requestError);
      setError(errorMsg);
      toast.error(errorMsg);
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
