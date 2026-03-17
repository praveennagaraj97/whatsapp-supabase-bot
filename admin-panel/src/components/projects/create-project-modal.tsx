'use client';

import { AxiosError } from 'axios';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { projectService } from '@/services/api/project-service';
import type { CreateProjectPayload } from '@/types/api';

type CreateProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
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

export function CreateProjectModal({
  isOpen,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [botName, setBotName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  function resetForm() {
    setName('');
    setSlug('');
    setBotName('');
    setDescription('');
    setSystemPrompt('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      toast.info('Project name is required');
      return;
    }

    const payload: CreateProjectPayload = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      bot_name: botName.trim() || undefined,
      description: description.trim() || undefined,
      system_prompt: systemPrompt.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await projectService.createProject(payload);
      toast.success('Project created successfully');
      await onCreated();
      resetForm();
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    if (isSubmitting) return;
    onClose();
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/35 p-4"
          onClick={handleClose}
        >
          <motion.form
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onSubmit={handleSubmit}
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl border border-(--panel-border) bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
          >
            <h3 className="text-xl font-semibold text-foreground">
              Create New Project
            </h3>
            <p className="text-(--muted) mt-1 text-sm">
              Add project metadata now. You can refine prompts and data in
              detail page.
            </p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-(--muted) mb-1.5 block text-xs font-medium uppercase tracking-[0.16em]">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Demo Store"
                  className="w-full rounded-xl border border-(--panel-border) bg-white px-3 py-2.5 text-sm outline-none focus:border-(--accent)"
                />
              </label>

              <label className="block">
                <span className="text-(--muted) mb-1.5 block text-xs font-medium uppercase tracking-[0.16em]">
                  Slug
                </span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="demo-store"
                  className="w-full rounded-xl border border-(--panel-border) bg-white px-3 py-2.5 text-sm outline-none focus:border-(--accent)"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-(--muted) mb-1.5 block text-xs font-medium uppercase tracking-[0.16em]">
                  Bot Name
                </span>
                <input
                  value={botName}
                  onChange={(event) => setBotName(event.target.value)}
                  placeholder="Store Assistant"
                  className="w-full rounded-xl border border-(--panel-border) bg-white px-3 py-2.5 text-sm outline-none focus:border-(--accent)"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-(--muted) mb-1.5 block text-xs font-medium uppercase tracking-[0.16em]">
                  Description
                </span>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Short project description"
                  className="h-20 w-full rounded-xl border border-(--panel-border) bg-white px-3 py-2.5 text-sm outline-none focus:border-(--accent)"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-(--muted) mb-1.5 block text-xs font-medium uppercase tracking-[0.16em]">
                  System Prompt
                </span>
                <textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="Initial AI instruction..."
                  className="h-24 w-full rounded-xl border border-(--panel-border) bg-white px-3 py-2.5 text-sm outline-none focus:border-(--accent)"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="rounded-xl border border-(--panel-border) px-4 py-2 text-sm font-medium text-foreground hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
