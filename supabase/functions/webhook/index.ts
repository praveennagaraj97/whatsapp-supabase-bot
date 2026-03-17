// WhatsApp Webhook Edge Function
// Handles incoming WhatsApp messages, processes them with Gemini AI,
// and sends responses back via Meta WhatsApp Cloud API.

import { saveReceivedMessage, saveSentMessage } from "../_shared/chat-history.ts";
import {
  INACTIVITY_BUTTON_PROCEED_ID,
  INACTIVITY_BUTTON_PROCEED_TITLE,
  INACTIVITY_BUTTON_START_NEW_ID,
  INACTIVITY_BUTTON_START_NEW_TITLE,
  INACTIVITY_THRESHOLD_MINUTES,
  MAX_AUDIO_PER_BATCH,
  MAX_QUEUE_BATCH,
  MAX_QUEUE_TURNS,
  PROCESSING_TIMEOUT_MS,
} from "../_shared/constants.ts";
import { extractValidWhatsappMessages } from "../_shared/extract-message.ts";
import { processUserMessage, translateAudioToEnglish } from "../_shared/gemini.ts";
import { getAndClearInactivityMessage, setInactivityMessage } from "../_shared/inactivity.ts";
import {
  getMessageDedupKey,
  hasSuspiciousPatterns,
  isDuplicateInboundMessage,
  isOutOfOrderInboundMessage,
} from "../_shared/message-guards.ts";
import {
  composeQueuedMessages,
  drainHeadBatch,
  enqueueMessage,
  hasQueuedMessages,
} from "../_shared/message-queue.ts";
import {
  clearProjectCache,
  getEnabledProject,
  getEnabledProjectFromMemory,
  getEnabledProjectPrompt,
  getEnabledProjectPromptFromMemory,
  warmEnabledProjectCache,
} from "../_shared/projects.ts";
import { clearPromptsCache } from "../_shared/prompts-manager.ts";
import {
  deleteSession,
  getMinutesSinceLastMessage,
  getMinutesSinceSessionUpdate,
  getOrCreateSession,
  sessionHasData,
  startNewSession,
  updateSession,
} from "../_shared/session.ts";
import type {
  AIPromptResponse,
  ProjectConfig,
  SimplifiedMessage,
  UserSession,
  WhatsAppWebhookPayload,
} from "../_shared/types.ts";
import {
  getMediaUrl,
  sendInteractiveButtons,
  sendInteractiveList,
  sendText,
  sendTyping,
} from "../_shared/whatsapp.ts";

// ─── CORS handler ───
function corsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json",
    },
  });
}

async function refreshActiveProjectCache(): Promise<void> {
  clearProjectCache();
  clearPromptsCache();
  await warmEnabledProjectCache();
  await getEnabledProjectPrompt();
}

async function handleCacheRefresh(_req: Request): Promise<Response> {
  await refreshActiveProjectCache();

  return jsonResponse({
    ok: true,
    projectId: getEnabledProjectFromMemory()?.id || null,
    promptLength: getEnabledProjectPromptFromMemory().length,
  });
}

// ─── Apply extracted data to session ───
function applyExtractedData(
  session: UserSession,
  data: AIPromptResponse["extractedData"],
): Partial<UserSession> {
  const update: Partial<UserSession> = {};

  const mergedExtractedData: Record<string, unknown> = {
    ...(session.extracted_data || {}),
  };

  for (const [key, value] of Object.entries(data || {})) {
    if (value !== undefined) {
      mergedExtractedData[key] = value;
    }
  }

  update.extracted_data = mergedExtractedData;

  const extractedUserName = mergedExtractedData.userName;
  if (typeof extractedUserName === "string" && extractedUserName.trim().length > 0) {
    update.user_name = extractedUserName.trim();
  }

  return update;
}

// ─── Send response based on nextAction ───
async function sendResponse(
  project: ProjectConfig,
  to: string,
  aiResponse: AIPromptResponse,
  _session: UserSession,
): Promise<void> {
  const { message, options } = aiResponse;

  // Options as buttons (max 3) or list
  if (options && options.length > 0) {
    if (options.length <= 3) {
      const buttons = options.map((opt, i) => ({
        id: `opt_${i}_${opt.slice(0, 15).replace(/[^a-zA-Z0-9_]/g, "")}`,
        title: opt.slice(0, 20),
      }));
      await sendInteractiveButtons(to, message, buttons);
    } else {
      const sections = [
        {
          title: "Options",
          rows: options.slice(0, 10).map((opt, i) => ({
            id: `opt_${i}_${opt.slice(0, 15).replace(/[^a-zA-Z0-9_]/g, "")}`,
            title: opt.slice(0, 24),
          })),
        },
      ];
      await sendInteractiveList(to, message, "Choose", sections);
    }
    await saveSentMessage(project.id, to, message);
    return;
  }

  // Default: plain text
  await sendText(to, message);
  await saveSentMessage(project.id, to, message);
}

// ─── Process one message turn ───
async function processOneTurn(
  project: ProjectConfig,
  message: SimplifiedMessage,
  session: UserSession,
  isNewSession: boolean,
): Promise<{ session: UserSession; aiResponse: AIPromptResponse }> {
  // Handle audio: get URL from Meta
  if (message.type === "audio" && message.audioId && !message.audioUrl) {
    const audioUrl = await getMediaUrl(message.audioId);
    if (audioUrl) {
      message.audioUrl = audioUrl;
    } else {
      await sendText(
        message.from,
        "Sorry, I couldn't process your audio message. Could you type your message instead?",
      );
      return {
        session,
        aiResponse: {
          extractedData: {},
          message: "",
          nextAction: null,
          status: { outcome: "FAILED", reason: "AUDIO_FAILED", field: null },
          options: null,
          conversationSummary: null,
        },
      };
    }
  }

  // Audio translation
  let userInputForProcessing = message.text || "";
  let inputType = message.type;
  let isTranslated = false;

  if (message.type === "audio" && message.audioUrl) {
    const translated = await translateAudioToEnglish(
      message.audioUrl,
      message.mimeType || "audio/ogg",
      message.from,
    );
    if (translated && translated.trim().length > 0) {
      userInputForProcessing = translated;
      inputType = "text";
      isTranslated = true;
    }
  }

  // Location to JSON
  if (message.type === "location" && message.location) {
    userInputForProcessing = JSON.stringify(message.location);
  }

  // Handle interactive selections
  if (inputType === "text" && userInputForProcessing.startsWith("opt_")) {
    const matchedOption = userInputForProcessing.match(/^opt_(\d+)_/)?.[1];
    if (matchedOption) {
      userInputForProcessing = `Selected option index: ${matchedOption}`;
    }
  }

  // Process with AI
  const aiResponse = await processUserMessage(
    {
      type: inputType as "text" | "audio" | "location",
      userInput: userInputForProcessing,
      mimeType: message.mimeType || "",
      isTranslatedFromAudio: isTranslated,
    },
    project,
    session,
    isNewSession,
  );

  // Apply extracted data
  const extracted = aiResponse.extractedData;
  const sessionUpdates = applyExtractedData(session, extracted);

  const updatedSession: UserSession = { ...session, ...sessionUpdates };

  return { session: updatedSession, aiResponse };
}

// ─── Main message handler ───
async function handleMessage(
  project: ProjectConfig,
  message: SimplifiedMessage,
  session: UserSession,
  isNewSession: boolean,
): Promise<void> {
  try {
    // Process until queue is empty
    let currentMessage = message;
    let currentSession = session;
    let isNew = isNewSession;
    let lastAiResponse: AIPromptResponse | null = null;

    for (let depth = 0; depth <= MAX_QUEUE_TURNS; depth++) {
      // Send typing indicator before AI processing
      if (currentMessage.id) {
        await sendTyping(currentMessage.id);
      }

      const turn = await processOneTurn(project, currentMessage, currentSession, isNew);
      currentSession = turn.session;
      lastAiResponse = turn.aiResponse;

      // Save conversation summary
      if (turn.aiResponse.conversationSummary) {
        currentSession.conversation_summary = turn.aiResponse.conversationSummary;
      }

      // Persist session state after each turn
      await updateSession(project.id, message.from, {
        ...currentSession,
        last_prompt_response: turn.aiResponse.message,
        last_prompt_field: turn.aiResponse.nextAction,
      });

      // Check for queued messages
      const hasQueue = await hasQueuedMessages(project.id, message.from);
      if (!hasQueue || depth >= MAX_QUEUE_TURNS) break;

      // Drain and compose next batch
      const drained = await drainHeadBatch(
        project.id,
        message.from,
        MAX_QUEUE_BATCH,
        MAX_AUDIO_PER_BATCH,
      );
      if (drained.length === 0) break;

      if (currentMessage.id) {
        await sendTyping(currentMessage.id);
      }

      currentMessage = await composeQueuedMessages(
        currentMessage,
        drained,
        translateAudioToEnglish,
      );

      // Refresh session
      const { session: refreshed } = await getOrCreateSession(project.id, message.from);
      // Preserve in-progress conversation summary
      if (currentSession.conversation_summary) {
        refreshed.conversation_summary = currentSession.conversation_summary;
      }

      currentSession = refreshed;
      isNew = false;
    }

    // Send final response
    if (lastAiResponse && lastAiResponse.message) {
      await sendResponse(project, message.from, lastAiResponse, currentSession);
    }
  } catch (error) {
    console.error("handleMessage error:", error);
    await sendText(
      message.from,
      "Sorry, something went wrong. Please try again in a moment.",
    );
  } finally {
    // Clear processing flag
    await updateSession(project.id, message.from, {
      is_processing: false,
      processing_started_at: null,
    } as Partial<UserSession>);
  }
}

// ─── Main Deno.serve handler ───
const port = Number(Deno.env.get("PORT") || "8000");

// Warm enabled project and prompt cache at cold start to avoid DB reads on every message.
void refreshActiveProjectCache().catch((error) => {
  console.warn("Initial project cache warm-up skipped:", error);
});

Deno.serve({ port }, async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return corsResponse();
  }

  const url = new URL(req.url);

  if (req.method === "POST" && url.pathname.endsWith("/refresh-cache")) {
    return await handleCacheRefresh(req);
  }

  // ─── GET: Meta webhook verification ───
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const challenge = url.searchParams.get("hub.challenge");
    const token = url.searchParams.get("hub.verify_token");
    const verifyToken = Deno.env.get("WEBHOOK_VERIFY_TOKEN") || "";

    if (mode === "subscribe" && token === verifyToken) {
      console.log("WEBHOOK VERIFIED");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // ─── POST: Incoming messages ───
  if (req.method === "POST") {
    try {
      const body: WhatsAppWebhookPayload = await req.json();
      const incomingMessages = extractValidWhatsappMessages(body);

      if (incomingMessages.length === 0) {
        return new Response(null, { status: 204 });
      }

      const [message, ...extraMessages] = incomingMessages;
      const project = await getEnabledProject();

      // Send typing indicator
      if (message.id) {
        await sendTyping(message.id);
      }

      // Reject suspicious input
      if (
        message.type === "text" &&
        hasSuspiciousPatterns(message.text || "")
      ) {
        console.warn(`Rejected suspicious input from ${message.from}`);
        await sendText(
          message.from,
          "I didn't quite understand that. Could you rephrase your request?",
        );
        return new Response(null, { status: 204 });
      }

      const { session, isNew } = await getOrCreateSession(project.id, message.from);

      // If webhook contains multiple user messages, enqueue extras now so the
      // processing loop can consume them in order after the first turn.
      if (extraMessages.length > 0) {
        for (const extraMessage of extraMessages) {
          await enqueueMessage(project.id, message.from, extraMessage);
        }
      }

      // Seed user_name from WhatsApp profile if not yet set
      if (message.profileName && !session.user_name) {
        await updateSession(project.id, message.from, {
          user_name: message.profileName,
        } as Partial<UserSession>);
        session.user_name = message.profileName;
      }

      // RESET command
      if (message.text === "RESET") {
        await startNewSession(session);
        await sendText(
          message.from,
          "Session reset! How can I help you today?",
        );
        return new Response(null, { status: 204 });
      }

      // DEV_RESET command
      if (message.text === "DEV_RESET") {
        await deleteSession(project.id, message.from);
        await sendText(
          message.from,
          "Session deleted. Send a new message to start fresh.",
        );
        return new Response(null, { status: 204 });
      }

      // Duplicate guard
      if (isDuplicateInboundMessage(session, message)) {
        return new Response(null, { status: 204 });
      }

      // Inactivity button handlers
      if (message.text === INACTIVITY_BUTTON_START_NEW_ID) {
        const newSession = await startNewSession(session);
        // Check for stored message
        const stored = await getAndClearInactivityMessage(project.id, message.from);
        if (stored) {
          await updateSession(project.id, message.from, {
            is_processing: true,
            processing_started_at: new Date().toISOString(),
            last_user_message: getMessageDedupKey(stored),
            last_message_timestamp: stored.timestamp,
          } as Partial<UserSession>);
          await handleMessage(project, stored, newSession, true);
        } else {
          await sendText(
            message.from,
            "Fresh start! How can I help you today? 😊",
          );
        }
        return new Response(null, { status: 204 });
      }

      if (message.text === INACTIVITY_BUTTON_PROCEED_ID) {
        const stored = await getAndClearInactivityMessage(project.id, message.from);
        if (stored) {
          await updateSession(project.id, message.from, {
            is_processing: true,
            processing_started_at: new Date().toISOString(),
            last_user_message: getMessageDedupKey(stored),
            last_message_timestamp: stored.timestamp,
          } as Partial<UserSession>);
          await handleMessage(project, stored, session, false);
        }
        return new Response(null, { status: 204 });
      }

      // Out-of-order guard
      if (isOutOfOrderInboundMessage(session, message)) {
        return new Response(null, { status: 204 });
      }

      // Save received message to chat history
      try {
        await saveReceivedMessage(
          project.id,
          message.from,
          message.text ||
            message.audioId ||
            JSON.stringify(message.location) ||
            "",
          message.type,
          message.timestamp,
        );
      } catch (e) {
        console.error("Failed to save received message:", e);
      }

      // Paused auto-replies
      if (session.pause_auto_replies) {
        await updateSession(project.id, message.from, {
          last_message_timestamp: message.timestamp,
        } as Partial<UserSession>);
        return new Response(null, { status: 204 });
      }

      // Currently processing: enqueue
      if (session.is_processing) {
        // Check for stuck processing (timeout)
        if (session.processing_started_at) {
          const startedAt = new Date(session.processing_started_at).getTime();
          if (Date.now() - startedAt > PROCESSING_TIMEOUT_MS) {
            console.warn(
              `Processing timeout for ${message.from}, resetting flag`,
            );
            await updateSession(project.id, message.from, {
              is_processing: false,
              processing_started_at: null,
            } as Partial<UserSession>);
            // Fall through to process normally
          } else {
            const lastContent = getMessageDedupKey(message);
            await updateSession(project.id, message.from, {
              last_user_message: lastContent,
              last_message_timestamp: message.timestamp,
            } as Partial<UserSession>);
            await enqueueMessage(project.id, message.from, message);
            return new Response(null, { status: 204 });
          }
        } else {
          const lastContent = getMessageDedupKey(message);
          await updateSession(project.id, message.from, {
            last_user_message: lastContent,
            last_message_timestamp: message.timestamp,
          } as Partial<UserSession>);
          await enqueueMessage(project.id, message.from, message);
          return new Response(null, { status: 204 });
        }
      }

      // Inactivity check
      const minutesSinceUpdate = getMinutesSinceSessionUpdate(session);
      const minutesSinceLast = getMinutesSinceLastMessage(session);
      const threshold = INACTIVITY_THRESHOLD_MINUTES;

      if (
        !isNew &&
        threshold > 0 &&
        Math.min(minutesSinceUpdate, minutesSinceLast) >= threshold &&
        sessionHasData(session)
      ) {
        await setInactivityMessage(project.id, message.from, message);
        await sendInteractiveButtons(
          message.from,
          "*It's been a while.*\n\nWould you like to continue from where we left off, or start a new session?",
          [
            {
              id: INACTIVITY_BUTTON_PROCEED_ID,
              title: INACTIVITY_BUTTON_PROCEED_TITLE,
            },
            {
              id: INACTIVITY_BUTTON_START_NEW_ID,
              title: INACTIVITY_BUTTON_START_NEW_TITLE,
            },
          ],
        );
        await updateSession(project.id, message.from, {
          last_message_timestamp: message.timestamp,
        } as Partial<UserSession>);
        return new Response(null, { status: 204 });
      }

      // New user welcome
      if (!session.is_intro_sent) {
        await updateSession(project.id, message.from, {
          is_intro_sent: true,
        } as Partial<UserSession>);
        session.is_intro_sent = true;

        const nameGreeting = session.user_name ? ` ${session.user_name}` : "";
        await sendText(
          message.from,
          project.welcome_message ||
            `Welcome${nameGreeting} to *${project.bot_name}*!\n\nI am here to help with *${project.name}*. You can ask questions or send voice messages in English, Hindi, Tamil, Telugu, Malayalam, or Kannada.\n\nHow can I help you today?`,
        );
        await saveSentMessage(
          project.id,
          message.from,
          `Welcome to ${project.bot_name}! How can I help you today?`,
        );

        // Small delay before processing
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Set processing flag
      const lastContent = getMessageDedupKey(message);
      const processingStartedAt = new Date().toISOString();

      await updateSession(project.id, message.from, {
        is_processing: true,
        processing_started_at: processingStartedAt,
        last_user_message: lastContent,
        last_message_timestamp: message.timestamp,
      } as Partial<UserSession>);

      session.is_processing = true;
      session.processing_started_at = processingStartedAt;
      session.last_user_message = lastContent;
      session.last_message_timestamp = message.timestamp;

      // Process the message
      await handleMessage(project, message, session, isNew);

      return new Response(null, { status: 204 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(null, { status: 204 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
