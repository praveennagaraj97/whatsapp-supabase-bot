'use client';

import { ConfirmModal } from '@/components/confirm-modal';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';

import type { Project } from '@/types/api';

type ProjectCardProps = {
  project: Project;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

export function ProjectCard({ project, onToggle, onDelete }: ProjectCardProps) {
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [error, setError] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  async function handleToggle() {
    setError('');
    setIsTogglingEnabled(true);

    try {
      await onToggle(project.id, !project.is_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setIsTogglingEnabled(false);
    }
  }

  function openDeleteModal() {
    setIsDeleteModalOpen(true);
  }

  async function handleDeleteConfirm() {
    setError('');
    setIsDeletingProject(true);
    try {
      await onDelete(project.id);
      setIsDeleteModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setIsDeletingProject(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="group relative overflow-hidden rounded-3xl border border-(--panel-border) bg-white/92 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_44px_rgba(15,23,42,0.14)]"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-cyan-400 via-blue-500 to-indigo-500 opacity-80" />

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-(--muted) text-[11px] uppercase tracking-[0.24em]">
            Project
          </p>
          <h3 className="mt-1 text-lg font-semibold text-foreground">
            {project.name}
          </h3>
          <p className="text-(--muted) mt-1 text-sm">/{project.slug}</p>
          {project.description && (
            <p className="text-(--muted) mt-2 line-clamp-2 text-sm">
              {project.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
              project.is_enabled
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-zinc-100 text-zinc-600'
            }`}
          >
            {project.is_enabled ? 'Enabled' : 'Disabled'}
          </span>

          <button
            type="button"
            onClick={handleToggle}
            disabled={isTogglingEnabled}
            className={`relative inline-flex h-8 w-14 items-center rounded-full border transition ${
              project.is_enabled
                ? 'border-emerald-400 bg-emerald-500 hover:bg-emerald-600'
                : 'border-zinc-300 bg-zinc-300 hover:bg-zinc-400'
            } ${isTogglingEnabled ? 'opacity-50' : ''}`}
          >
            <motion.div
              initial={false}
              animate={{ x: project.is_enabled ? 28 : 4 }}
              transition={{ type: 'spring', stiffness: 500, damping: 50 }}
              className="h-6 w-6 rounded-full bg-white"
            />
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="flex flex-1 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
        >
          View
        </Link>

        <button
          type="button"
          onClick={openDeleteModal}
          disabled={isDeletingProject}
          className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
        >
          {isDeletingProject ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        title="Delete Project"
        description={`Are you sure you want to delete project "${project.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isConfirming={isDeletingProject}
        onCancel={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </motion.div>
  );
}
