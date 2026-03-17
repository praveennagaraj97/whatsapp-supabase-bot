'use client';

import { AxiosError } from 'axios';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmModal } from '@/components/confirm-modal';
import { ProjectCard } from '@/components/project-card';
import { CreateProjectModal } from '@/components/projects/create-project-modal';
import { projectDetailService } from '@/services/api/project-detail-service';
import { projectService } from '@/services/api/project-service';
import type { Project } from '@/types/api';

type ProjectsViewProps = {
  projects: Project[];
  onLogout: () => void;
  mutate: () => Promise<void>;
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

export function ProjectsView({
  projects,
  onLogout,
  mutate,
}: ProjectsViewProps) {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<
    string | null
  >(null);
  const [isDeletingProject, setIsDeletingProject] = useState(false);

  function handleLogout() {
    onLogout();
    router.push('/');
  }

  async function handleToggleProject(id: string, enabled: boolean) {
    try {
      await projectService.enableProject(id);
      await mutate();
      toast.success(
        enabled
          ? 'Project disabled successfully'
          : 'Project enabled successfully',
      );
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
    }
  }

  async function handleDeleteProjectConfirm() {
    if (!pendingDeleteProjectId) return;

    setIsDeletingProject(true);
    try {
      await projectDetailService.deleteProject(pendingDeleteProjectId);
      await mutate();
      toast.success('Project deleted successfully');
      setPendingDeleteProjectId(null);
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      toast.error(errorMsg);
    } finally {
      setIsDeletingProject(false);
    }
  }

  async function handleDeleteProject(id: string): Promise<void> {
    setPendingDeleteProjectId(id);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-linear-to-br from-slate-100 via-sky-50 to-amber-50">
      <div className="pointer-events-none absolute -left-36 top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.25),transparent_70%)]" />
      <div className="pointer-events-none absolute -right-24 bottom-12 h-80 w-80 rounded-full bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.22),transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative z-10 mx-auto max-w-6xl px-6 py-8"
      >
        <div className="mb-6 rounded-3xl border border-(--panel-border) bg-white/80 p-5 shadow-[0_8px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-(--muted) text-xs uppercase tracking-[0.24em]">
                Workspace Overview
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {projects.length}{' '}
                {projects.length === 1 ? 'Project' : 'Projects'} Available
              </p>
              <p className="text-(--muted) mt-1 text-sm">
                Manage status, prompts, and data imports from a single
                dashboard.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                New Project
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-(--panel-border) bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        {projects.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-3xl border border-(--panel-border) bg-white/85 px-8 py-14 text-center shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
          >
            <p className="text-(--muted) text-sm">
              No projects yet. Create one to get started.
            </p>
          </motion.div>
        ) : (
          <motion.div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.08,
                },
              },
            }}
          >
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onToggle={handleToggleProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={mutate}
      />

      <ConfirmModal
        isOpen={pendingDeleteProjectId !== null}
        title="Delete Project"
        description="Are you sure you want to delete this project? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isConfirming={isDeletingProject}
        onCancel={() => setPendingDeleteProjectId(null)}
        onConfirm={handleDeleteProjectConfirm}
      />
    </div>
  );
}
