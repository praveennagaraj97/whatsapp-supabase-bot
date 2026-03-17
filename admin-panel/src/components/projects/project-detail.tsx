'use client';

import { AxiosError } from 'axios';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmModal } from '@/components/confirm-modal';
import { STORAGE_KEYS } from '@/constants/api-routes';
import { useProjectDetail } from '@/hooks/api/use-project-detail';
import { projectDetailService } from '@/services/api/project-detail-service';
import type { ExtractedFieldInput, ProjectDataTableSummary } from '@/types/api';
import {
  fetchGoogleSheetsTables,
  type SheetLoadConfig,
  type SheetTable,
} from '../../utils/sheets-parser';

type ProjectDetailProps = {
  projectId: string;
};

// Must stay in sync with supabase/functions/_shared/prompts/system-prompt.ts
const PREDEFINED_FORMAT_RULES = `## OUTPUT FORMAT
Return a single valid JSON object that exactly matches the defined response schema.
Do NOT include any prose, markdown, or text outside the JSON object.

## WHATSAPP MESSAGE FORMATTING
All text inside the \`message\` field must follow WhatsApp formatting rules:
- Separate different thoughts or topics with a blank line.
- Use *bold* (single asterisk) to highlight important terms or fields the user must fill.
- Use _italic_ (single underscore) sparingly for gentle emphasis.
- Keep each message short — 2 to 4 sentences maximum.
- Never use markdown headers (# or ##), bullet dashes (-), or numbered lists inside \`message\`. Use plain text with line breaks instead.
- Emojis are encouraged to keep the tone light and engaging. Use them naturally.

## TONE & STYLE
- Be friendly, concise, and conversational — like a knowledgeable friend, not a corporate bot.
- Always respond in clear, simple English regardless of the user's input language.
- When a server validation error or unavailability is present, switch to a slightly apologetic tone and avoid overly cheerful emojis.

## NO INTERNAL IDs IN MESSAGES
Never mention internal IDs, codes, UUIDs, or numeric identifiers inside \`message\`.
Always refer to items by their descriptive name or natural language equivalent.

## KNOWLEDGE BOUNDARY
Answer factual questions using ONLY the data provided in PROJECT DATA TABLES.
If required data is missing from the tables, ask a concise follow-up question instead of guessing.
Never hallucinate or invent data that is not present.

## EXTRACTION RULES
- Extract all clearly available values from the user message into \`extractedData\` in the same turn.
- Do not drop valid extracted values just because another field in the same turn is invalid.
- Do not clear previously valid fields unless the user explicitly corrects them.
- Keep extracted values consistent with the message text.

## CONVERSATION SUMMARY RULES
- Populate \`conversationSummary\` as a short cumulative summary across turns.
- Preserve important previously confirmed facts while adding newly confirmed updates.
- Keep it concise and useful for next-turn context.
- Do not include internal IDs or sensitive data in the summary.

## SUPPORT ESCALATION
When directing the user to customer support, always share the configured support contact.`.trim();

const REQUIRED_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    extractedData: { type: 'OBJECT' },
    message: { type: 'STRING' },
    nextAction: { type: 'STRING', nullable: true },
    status: {
      type: 'OBJECT',
      properties: {
        outcome: {
          type: 'STRING',
          enum: ['SUCCESS', 'PARTIAL_SUCCESS', 'FAILED', 'AMBIGUOUS'],
        },
        reason: { type: 'STRING', nullable: true },
        field: { type: 'STRING', nullable: true },
      },
      required: ['outcome'],
    },
    options: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      nullable: true,
    },
    conversationSummary: { type: 'STRING', nullable: true },
  },
  required: [
    'extractedData',
    'message',
    'nextAction',
    'status',
    'options',
    'conversationSummary',
  ],
};

const EXTRACTED_FIELD_TYPES: ExtractedFieldInput['type'][] = [
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'ARRAY',
  'OBJECT',
];

function createExtractedFieldInput(): ExtractedFieldInput {
  return {
    id: crypto.randomUUID(),
    name: '',
    type: 'STRING',
    nullable: true,
  };
}

function getExtractedFieldsFromSchema(
  schema: Record<string, unknown>,
): ExtractedFieldInput[] {
  const properties = (
    schema as {
      properties?: { extractedData?: { properties?: Record<string, unknown> } };
    }
  )?.properties?.extractedData?.properties;

  if (!properties || typeof properties !== 'object') {
    return [];
  }

  return Object.entries(properties)
    .filter(([name]) => name.trim().length > 0)
    .map(([name, config]) => {
      const rawType =
        typeof config === 'object' && config !== null && 'type' in config
          ? String((config as { type?: unknown }).type).toUpperCase()
          : 'STRING';

      const normalizedType = EXTRACTED_FIELD_TYPES.includes(
        rawType as ExtractedFieldInput['type'],
      )
        ? (rawType as ExtractedFieldInput['type'])
        : 'STRING';

      const nullable =
        typeof config === 'object' && config !== null && 'nullable' in config
          ? Boolean((config as { nullable?: unknown }).nullable)
          : true;

      return {
        id: crypto.randomUUID(),
        name,
        type: normalizedType,
        nullable,
      };
    });
}

function buildResponseSchemaFromExtractedFields(
  fields: ExtractedFieldInput[],
): Record<string, unknown> {
  const extractedProperties = fields.reduce<Record<string, unknown>>(
    (acc, field) => {
      const key = field.name.trim();
      if (!key) return acc;
      acc[key] = { type: field.type, nullable: field.nullable };
      return acc;
    },
    {},
  );

  return {
    ...REQUIRED_RESPONSE_SCHEMA,
    properties: {
      ...REQUIRED_RESPONSE_SCHEMA.properties,
      extractedData: {
        type: 'OBJECT',
        properties: extractedProperties,
      },
    },
  };
}

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
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [loadedTables, setLoadedTables] = useState<SheetTable[]>([]);
  const [selectedTableKey, setSelectedTableKey] = useState('');
  const [tableConfigs, setTableConfigs] = useState<SheetLoadConfig[]>([
    {
      tableName: 'Sheet 1',
      sourceTab: '',
      backendKey: 'table_1',
    },
  ]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmittingData, setIsSubmittingData] = useState(false);
  const [extractedFields, setExtractedFields] = useState<ExtractedFieldInput[]>(
    [],
  );
  const [existingTables, setExistingTables] = useState<
    ProjectDataTableSummary[]
  >([]);
  const [isLoadingExistingTables, setIsLoadingExistingTables] = useState(false);
  const [isSavingAiConfig, setIsSavingAiConfig] = useState(false);
  const [showPredefinedRules, setShowPredefinedRules] = useState(false);

  const project = data?.project;

  // Update local state when project data loads
  useEffect(() => {
    if (project) {
      setSystemPrompt(project.system_prompt || '');
    }
  }, [project]);

  const loadExistingDataTables = useCallback(async () => {
    setIsLoadingExistingTables(true);
    try {
      const response =
        await projectDetailService.getProjectDataTables(projectId);
      setExistingTables(response.tables || []);
    } catch {
      setExistingTables([]);
    } finally {
      setIsLoadingExistingTables(false);
    }
  }, [projectId]);

  useEffect(() => {
    let isMounted = true;

    async function loadPromptConfig() {
      try {
        const response =
          await projectDetailService.getProjectPrompts(projectId);
        if (!isMounted) return;

        setSystemPrompt(
          response.prompts.systemPrompt || project?.system_prompt || '',
        );
        setExtractedFields(
          getExtractedFieldsFromSchema(response.prompts.responseSchema || {}),
        );
      } catch {
        if (!isMounted) return;
        setExtractedFields([]);
      }
    }

    void loadPromptConfig();
    void loadExistingDataTables();

    return () => {
      isMounted = false;
    };
  }, [loadExistingDataTables, project?.system_prompt, projectId]);

  async function handleLoadSheetData() {
    if (!dataSourceUrl.trim()) {
      toast.info('Please enter a Google Sheets URL or spreadsheet ID');
      return;
    }

    const validConfigs = tableConfigs.filter((config) =>
      config.backendKey.trim(),
    );
    if (validConfigs.length === 0) {
      toast.info('Add at least one table mapping with backend key');
      return;
    }

    setIsLoadingSheets(true);
    const toastId = toast.loading('Loading sheet data...');
    try {
      const tables = await fetchGoogleSheetsTables(dataSourceUrl, validConfigs);

      if (tables.length === 0) {
        toast.info('No rows found in this sheet');
        setLoadedTables([]);
        return;
      }

      setLoadedTables(tables);
      setSelectedTableKey(tables[0].key);
      toast.success(
        `Loaded ${tables.length} table${tables.length > 1 ? 's' : ''}`,
      );
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      toast.error(errorMsg);
    } finally {
      toast.dismiss(toastId);
      setIsLoadingSheets(false);
    }
  }

  function handleAddTableConfig() {
    setTableConfigs((prev) => [
      ...prev,
      {
        tableName: `Sheet ${prev.length + 1}`,
        sourceTab: '',
        backendKey: `table_${prev.length + 1}`,
      },
    ]);
  }

  function handleRemoveTableConfig(index: number) {
    setTableConfigs((prev) =>
      prev.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function handleUpdateTableConfig(
    index: number,
    key: keyof SheetLoadConfig,
    value: string,
  ) {
    setTableConfigs((prev) =>
      prev.map((config, currentIndex) => {
        if (currentIndex !== index) return config;

        if (key === 'backendKey') {
          return {
            ...config,
            backendKey: value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, '_'),
          };
        }

        return {
          ...config,
          [key]: value,
        };
      }),
    );
  }

  async function handleConfirmImport() {
    if (!project || loadedTables.length === 0) {
      toast.info('Load at least one table before submitting');
      return;
    }

    const normalizedData: Record<string, Record<string, unknown>[]> = {};

    for (const table of loadedTables) {
      const mappedKey = (table.backendKey || '').trim();
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

      const importedSummary = Object.entries(response.imported)
        .map(([key, count]) => `${key}: ${count}`)
        .join(', ');

      toast.success(`Import complete. ${importedSummary}`);
      setIsConfirmModalOpen(false);
      await loadExistingDataTables();
    } catch (err) {
      const errorMsg = getErrorMessage(err);
      toast.error(errorMsg);
    } finally {
      setIsSubmittingData(false);
    }
  }

  async function handleSaveAiConfig() {
    if (!systemPrompt.trim()) {
      toast.error('System prompt cannot be empty');
      return;
    }

    const responseSchema =
      buildResponseSchemaFromExtractedFields(extractedFields);

    setIsSavingAiConfig(true);
    try {
      await projectDetailService.updateProjectPrompts(projectId, {
        systemPrompt,
        responseSchema,
      });
      toast.success('AI configuration updated');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSavingAiConfig(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEYS.adminToken);
    toast.info('Logged out');
    router.push('/');
  }

  function handleAddExtractedField() {
    setExtractedFields((prev) => [...prev, createExtractedFieldInput()]);
  }

  function handleRemoveExtractedField(fieldId: string) {
    setExtractedFields((prev) => prev.filter((field) => field.id !== fieldId));
  }

  function handleUpdateExtractedField(
    fieldId: string,
    key: keyof Omit<ExtractedFieldInput, 'id'>,
    value: string | boolean,
  ) {
    setExtractedFields((prev) =>
      prev.map((field) =>
        field.id === fieldId
          ? {
              ...field,
              [key]: value,
            }
          : field,
      ),
    );
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
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="rounded-2xl border border-(--panel-border) bg-(--panel) p-6"
          >
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              AI Configuration
            </h2>

            <div className="grid gap-4">
              {/* Predefined rules — read-only, always applied by the platform */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <button
                  type="button"
                  onClick={() => setShowPredefinedRules((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Predefined Format Rules
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      Always injected by the platform. Not editable.
                    </p>
                  </div>
                  <span className="text-xs font-medium text-amber-700">
                    {showPredefinedRules ? 'Hide ▲' : 'Show ▼'}
                  </span>
                </button>

                {showPredefinedRules && (
                  <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-amber-200 bg-white/80 p-3 text-xs leading-relaxed text-zinc-700">
                    {PREDEFINED_FORMAT_RULES}
                  </pre>
                )}
              </div>

              <label className="block">
                <span className="text-(--muted) mb-2 block text-sm font-medium">
                  System Prompt{' '}
                  <span className="font-normal text-zinc-400">
                    (domain behaviour — your editable part)
                  </span>
                </span>
                <textarea
                  value={systemPrompt}
                  onChange={(event) => setSystemPrompt(event.target.value)}
                  placeholder="Define assistant behavior for your domain (ecommerce, support, education, etc.)"
                  className="h-28 w-full rounded-xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
                />
              </label>

              <label className="block">
                <span className="text-(--muted) mb-2 block text-sm font-medium">
                  Extraction Fields
                </span>
                <div className="space-y-2 rounded-xl border border-(--panel-border) bg-white/85 p-3">
                  {extractedFields.length === 0 ? (
                    <p className="text-(--muted) text-xs">
                      No extraction fields yet. Add fields below.
                    </p>
                  ) : (
                    extractedFields.map((field) => (
                      <div
                        key={field.id}
                        className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-center"
                      >
                        <input
                          value={field.name}
                          onChange={(event) =>
                            handleUpdateExtractedField(
                              field.id,
                              'name',
                              event.target.value,
                            )
                          }
                          placeholder="field name (e.g. orderId)"
                          className="rounded-md border border-(--panel-border) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                        />
                        <select
                          value={field.type}
                          onChange={(event) =>
                            handleUpdateExtractedField(
                              field.id,
                              'type',
                              event.target.value,
                            )
                          }
                          className="rounded-md border border-(--panel-border) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                        >
                          {EXTRACTED_FIELD_TYPES.map((fieldType) => (
                            <option key={fieldType} value={fieldType}>
                              {fieldType}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-foreground">
                          <input
                            type="checkbox"
                            checked={field.nullable}
                            onChange={(event) =>
                              handleUpdateExtractedField(
                                field.id,
                                'nullable',
                                event.target.checked,
                              )
                            }
                          />
                          Nullable
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveExtractedField(field.id)}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Remove
                        </button>
                      </div>
                    ))
                  )}

                  <button
                    type="button"
                    onClick={handleAddExtractedField}
                    className="rounded-lg border border-(--panel-border) bg-white px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-zinc-100"
                  >
                    Add Extraction Field
                  </button>
                </div>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSaveAiConfig}
                disabled={isSavingAiConfig}
                className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
              >
                {isSavingAiConfig ? 'Saving AI Config...' : 'Save AI Config'}
              </button>
            </div>
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

            <div className="mb-4 rounded-xl border border-(--panel-border) bg-white/80 p-4">
              <p className="text-(--muted) text-xs uppercase tracking-[0.22em]">
                Existing Backend Tables
              </p>
              {isLoadingExistingTables ? (
                <p className="text-(--muted) mt-2 text-sm">
                  Loading existing data...
                </p>
              ) : existingTables.length === 0 ? (
                <p className="text-(--muted) mt-2 text-sm">
                  No imported tables yet.
                </p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {existingTables.map((table) => (
                    <div
                      key={table.tableName}
                      className="grid gap-1 rounded-lg border border-(--panel-border) bg-white p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {table.tableName}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {table.rowCount} rows
                      </p>
                      <p className="text-xs text-zinc-500">
                        {table.updatedAt
                          ? `updated ${new Date(table.updatedAt).toLocaleString()}`
                          : 'updated -'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-(--muted) mb-2 block text-sm font-medium">
                Google Sheets URL or Spreadsheet ID
              </span>
              <input
                type="text"
                value={dataSourceUrl}
                onChange={(e) => setDataSourceUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="w-full rounded-xl border border-(--panel-border) bg-white/85 px-4 py-3 text-sm text-foreground outline-none transition focus:border-(--accent)"
              />
            </label>

            <p className="text-(--muted) mt-2 text-xs">
              Paste a public Google Sheets URL or direct spreadsheet ID. Map
              each table to any domain key (for example: products, courses,
              tickets).
            </p>

            <div className="mt-4 rounded-xl border border-(--panel-border) bg-white/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-(--muted) text-xs uppercase tracking-[0.22em]">
                  Table Configuration
                </p>
                <button
                  type="button"
                  onClick={handleAddTableConfig}
                  className="rounded-lg border border-(--panel-border) bg-white px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-zinc-100"
                >
                  Add Table
                </button>
              </div>

              <div className="space-y-3">
                {tableConfigs.map((config, index) => (
                  <div
                    key={`config-${index}`}
                    className="grid gap-2 rounded-lg border border-(--panel-border) bg-white p-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-3">
                      <input
                        value={config.tableName}
                        onChange={(event) =>
                          handleUpdateTableConfig(
                            index,
                            'tableName',
                            event.target.value,
                          )
                        }
                        placeholder="Table label"
                        className="rounded-md border border-(--panel-border) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                      />
                      <input
                        value={config.sourceTab || ''}
                        onChange={(event) =>
                          handleUpdateTableConfig(
                            index,
                            'sourceTab',
                            event.target.value,
                          )
                        }
                        placeholder="GID or Sheet Name (optional)"
                        className="rounded-md border border-(--panel-border) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                      />
                      <input
                        value={config.backendKey}
                        onChange={(event) =>
                          handleUpdateTableConfig(
                            index,
                            'backendKey',
                            event.target.value,
                          )
                        }
                        placeholder="backend key"
                        className="rounded-md border border-(--panel-border) px-2.5 py-2 text-sm outline-none focus:border-(--accent)"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-(--muted) text-xs">
                        Use GID for exact tab targeting. Leave empty for default
                        sheet.
                      </p>
                      {tableConfigs.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => handleRemoveTableConfig(index)}
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 transition hover:bg-red-100"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
                        <p className="text-sm font-semibold text-foreground">
                          {table.name}
                        </p>
                        <p className="text-(--muted) text-xs">
                          {table.rows.length} rows - source {table.source}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-(--panel-border) bg-white/80 p-4">
                  <p className="text-(--muted) text-xs uppercase tracking-[0.22em]">
                    Loaded Mapping
                  </p>

                  <div className="mt-3 grid gap-3">
                    {loadedTables.map((table) => (
                      <div
                        key={`map-${table.key}`}
                        className="grid gap-2 rounded-lg border border-(--panel-border) bg-white p-3 sm:grid-cols-[1fr_1fr_1fr] sm:items-center"
                      >
                        <p className="text-sm font-medium text-foreground">
                          {table.name}
                        </p>
                        <p className="text-xs text-zinc-600">
                          source: {table.source}
                        </p>
                        <p className="text-xs font-semibold text-blue-700">
                          backend: {table.backendKey}
                        </p>
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
                        Showing first {Math.min(8, selectedTable.rows.length)}{' '}
                        rows
                      </p>
                    </div>

                    <div className="mt-3 overflow-x-auto rounded-lg border border-(--panel-border) max-w-4xl">
                      <table className=" border-collapse bg-white text-sm max-w-full">
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
                          {selectedTable.rows
                            .slice(0, 8)
                            .map((row, rowIndex) => (
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
                    onChange={(event) =>
                      setReplaceExisting(event.target.checked)
                    }
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
