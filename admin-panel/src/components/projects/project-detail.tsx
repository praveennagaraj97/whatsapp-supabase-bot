'use client';

import { AxiosError } from 'axios';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmModal } from '@/components/confirm-modal';
import { STORAGE_KEYS } from '@/constants/api-routes';
import { useProjectDetail } from '@/hooks/api/use-project-detail';
import { projectDetailService } from '@/services/api/project-detail-service';
import {
  fetchGoogleSheetsTables,
  type SheetTable,
} from '@/utils/sheets-parser';

type ProjectDetailProps = {
  projectId: string;
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

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const router = useRouter();
  const { data, isLoading, error } = useProjectDetail(projectId);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [dataSourceUrl, setDataSourceUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [loadedTables, setLoadedTables] = useState<SheetTable[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState('');
  const [tableKeyMap, setTableKeyMap] = useState<Record<string, string>>({});
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmittingData, setIsSubmittingData] = useState(false);

  const project = data?.project;

  // Update local state when project data loads
  useEffect(() => {
    if (project) {
      setSystemPrompt(project.system_prompt || '');
    }
  }, [project]);

  async function handleSavePrompt() {
    if (!project || !systemPrompt.trim()) {
      toast.info('Please enter a system prompt');
      return;
    }

    setIsSaving(true);

    try {
      await projectDetailService.updateProject(projectId, {
        system_prompt: systemPrompt,
      });
      toast.success('Prompt saved successfully');
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      toast.error(errorMsg);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLoadSheetData() {
    if (!dataSourceUrl.trim()) {
      toast.info('Please enter a Google Sheets URL');
      return;
    }

    setIsLoadingSheets(true);
    try {
      const toastId = toast.loading('Loading sheet data...');
      const tables = await fetchGoogleSheetsTables(dataSourceUrl);

      if (tables.length === 0) {
        toast.dismiss(toastId);
        toast.info('No rows found in this sheet');
        setLoadedTables([]);
        return;
      }

      const nextMap: Record<string, string> = {};
      for (const table of tables) {
        nextMap[table.key] = table.key;
      }

      setLoadedTables(tables);
      setSelectedTableKey(tables[0].key);
      setTableKeyMap(nextMap);
      toast.dismiss(toastId);
      toast.success(`Loaded ${tables.length} table${tables.length > 1 ? 's' : ''}`);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      toast.error(errorMsg);
    } finally {
      setIsLoadingSheets(false);
    }
  }

  async function handleConfirmImport() {
    if (!project || loadedTables.length === 0) {
      toast.info('Load at least one table before submitting');
      return;
    }

    const normalizedData: Record<string, Record<string, unknown>[]> = {};

    for (const table of loadedTables) {
      const mappedKey = (tableKeyMap[table.key] || '').trim();
      if (!mappedKey) {
        toast.error(`Please provide a backend table key for ${table.name}`);
        return;
      }

      normalizedData[mappedKey] = table.rows;
    }

    setIsSubmittingData(true);
    try {
      const response = await projectDetailService.importProjectData(projectId, {
        data: normalizedData,
        replaceExisting,
      });

      toast.success(
        `Import complete: clinics ${response.imported.clinics}, doctors ${response.imported.doctors}, medicines ${response.imported.medicines}, faqs ${response.imported.faqs}`,
      );
      setIsConfirmModalOpen(false);
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      toast.error(errorMsg);
    } finally {
      setIsSubmittingData(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEYS.adminToken);
    toast.info('Logged out');
    router.push('/');
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-(--muted) text-sm">Loading project details...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-red-700">Failed to load project</p>
        <Link
          href="/"
          className="rounded-lg border border-(--panel-border) px-4 py-2 text-sm font-medium text-foreground transition hover:bg-zinc-100"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  const selectedTable =
    loadedTables.find((table) => table.key === selectedTableKey) || null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="min-h-screen bg-linear-to-br from-blue-50 to-zinc-50 px-6 py-8"
    >
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-blue-600 hover:underline">
              ← Back to Projects
            </Link>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">
              {project.name}
            </h1>
            <p className="text-(--muted) mt-1 text-sm">{project.slug}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-(--panel-border) px-4 py-2 text-sm font-medium text-foreground transition hover:bg-red-50 hover:text-red-700"
          >
            Logout
          </button>
        </div>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* System Prompt Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-2xl border border-(--panel-border) bg-(--panel) p-6"
          >
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              System Prompt
            </h2>

            <label className="block">
              <span className="text-(--muted) mb-2 block text-sm font-medium">
                Configure the AI prompt for this project
              </span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Enter your system prompt here..."
                className="h-32 w-full rounded-xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
              />
            </label>

            <button
              type="button"
              onClick={handleSavePrompt}
              disabled={isSaving}
              className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Prompt'}
            </button>
          </motion.div>

          {/* Data Source Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="rounded-2xl border border-(--panel-border) bg-(--panel) p-6"
          >
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Data Source
            </h2>

            <label className="block">
              <span className="text-(--muted) mb-2 block text-sm font-medium">
                Google Sheets URL
              </span>
              <input
                type="url"
                value={dataSourceUrl}
                onChange={(e) => setDataSourceUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
              />
            </label>

            <p className="text-(--muted) mt-2 text-xs">
              Paste a public Google Sheets URL to load data. The sheet must be
              shared publicly.
            </p>

            <button
              type="button"
              onClick={handleLoadSheetData}
              disabled={isLoadingSheets}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {isLoadingSheets ? 'Loading...' : 'Load & Preview Data'}
            </button>

            {loadedTables.length > 0 ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-(--panel-border) bg-white/80 p-4">
                  <p className="text-(--muted) text-xs uppercase tracking-[0.22em]">
                    Loaded Tables
                  </p>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {loadedTables.map((table) => (
                      <button
                        key={table.key}
                        type="button"
                        onClick={() => setSelectedTableKey(table.key)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selectedTableKey === table.key
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-(--panel-border) bg-white hover:bg-zinc-50'
                        }`}
                      >
                        <p className="text-sm font-semibold text-foreground">{table.name}</p>
                        <p className="text-(--muted) text-xs">
                          {table.rows.length} rows - gid {table.gid}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-(--panel-border) bg-white/80 p-4">
                  <p className="text-(--muted) text-xs uppercase tracking-[0.22em]">
                    Backend Mapping
                  </p>

                  <div className="mt-3 grid gap-3">
                    {loadedTables.map((table) => (
                      <div
                        key={`map-${table.key}`}
                        className="grid gap-2 sm:grid-cols-[1fr_1fr] sm:items-center"
                      >
                        <p className="text-sm font-medium text-foreground">{table.name}</p>
                        <input
                          type="text"
                          value={tableKeyMap[table.key] || ''}
                          onChange={(event) => {
                            setTableKeyMap((prev) => ({
                              ...prev,
                              [table.key]: event.target.value
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9_]/g, '_'),
                            }));
                          }}
                          placeholder="clinics, doctors, medicines, faqs"
                          className="w-full rounded-lg border border-(--panel-border) bg-white px-3 py-2 text-sm text-foreground outline-none transition focus:border-(--accent)"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {selectedTable ? (
                  <div className="rounded-xl border border-(--panel-border) bg-white/80 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-foreground">
                        {selectedTable.name} Preview
                      </p>
                      <p className="text-(--muted) text-xs">
                        Showing first {Math.min(8, selectedTable.rows.length)} rows
                      </p>
                    </div>

                    <div className="mt-3 overflow-auto rounded-lg border border-(--panel-border)">
                      <table className="min-w-full border-collapse bg-white text-sm">
                        <thead className="bg-zinc-100">
                          <tr>
                            {selectedTable.columns.map((column) => (
                              <th
                                key={column}
                                className="border-b border-(--panel-border) px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-700"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTable.rows.slice(0, 8).map((row, rowIndex) => (
                            <tr
                              key={`row-${rowIndex}`}
                              className="odd:bg-white even:bg-zinc-50/60"
                            >
                              {selectedTable.columns.map((column) => (
                                <td
                                  key={`${rowIndex}-${column}`}
                                  className="max-w-55 truncate border-b border-(--panel-border) px-3 py-2 align-top text-xs text-zinc-700"
                                  title={String(row[column] ?? '')}
                                >
                                  {String(row[column] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(event) => setReplaceExisting(event.target.checked)}
                    className="h-4 w-4 rounded border-(--panel-border)"
                  />
                  Replace existing project data before import
                </label>

                <button
                  type="button"
                  onClick={() => setIsConfirmModalOpen(true)}
                  className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                >
                  Submit Data to Backend
                </button>
              </div>
            ) : null}
          </motion.div>
        </div>
      </div>

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        title="Confirm Data Import"
        description={`This will import ${loadedTables.length} table${loadedTables.length === 1 ? '' : 's'} for ${project.name}. Continue?`}
        confirmText="Confirm Import"
        cancelText="Review Again"
        isConfirming={isSubmittingData}
        onCancel={() => setIsConfirmModalOpen(false)}
        onConfirm={handleConfirmImport}
      />
    </motion.div>
  );
}
