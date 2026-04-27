import { getDevSettingsCollection } from '../config/db.js';
import { appLogger } from '../lib/logger.js';
import {
  generateConnectionsGameForTopic,
  generateCrosswordGameForTopic,
  generatePromptleGameForTopic,
} from './dailyGameGeneration.js';

export const DAILY_GAME_MODES = ['promptle', 'connections', 'crossword'];
export const DAILY_GAME_TIMEZONE = 'America/Los_Angeles';
const SETTINGS_ID = 'global';

const dailyGamesLogger = appLogger.child({ component: 'daily-games' });

function createEmptyModeState() {
  return {
    queue: [],
    currentSchedule: null,
    generatedGame: null,
    upcomingGeneratedGame: null,
  };
}

export function getDefaultDailyGames() {
  return DAILY_GAME_MODES.reduce((accumulator, mode) => {
    accumulator[mode] = createEmptyModeState();
    return accumulator;
  }, {});
}

function normalizeTopic(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getDailyDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_GAME_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function getNextDailyDateKey(today = getDailyDateKey()) {
  const nextDay = new Date(`${today}T12:00:00.000Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return getDailyDateKey(nextDay);
}

function sanitizeQueue(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeTopic(entry))
    .filter(Boolean);
}

function sanitizeCurrentSchedule(value) {
  if (!value || typeof value !== 'object') return null;
  const topic = normalizeTopic(value.topic);
  const date = typeof value.date === 'string' ? value.date.trim() : '';
  if (!topic || !date) return null;
  return { topic, date };
}

function sanitizeGeneratedGame(value) {
  if (!value || typeof value !== 'object') return null;
  const topic = normalizeTopic(value.topic);
  const date = typeof value.date === 'string' ? value.date.trim() : '';
  const generatedAt = typeof value.generatedAt === 'string' ? value.generatedAt : null;
  const payload = value.payload && typeof value.payload === 'object' ? value.payload : null;
  if (!topic || !date || !payload) return null;
  return {
    topic,
    date,
    generatedAt,
    payload,
  };
}

export function sanitizeDailyModeState(value) {
  return {
    queue: sanitizeQueue(value?.queue),
    currentSchedule: sanitizeCurrentSchedule(value?.currentSchedule),
    generatedGame: sanitizeGeneratedGame(value?.generatedGame),
    upcomingGeneratedGame: sanitizeGeneratedGame(value?.upcomingGeneratedGame),
  };
}

export function sanitizeDailyGames(value) {
  const defaults = getDefaultDailyGames();
  DAILY_GAME_MODES.forEach((mode) => {
    defaults[mode] = sanitizeDailyModeState(value?.[mode]);
  });
  return defaults;
}

function cloneModeState(state) {
  return {
    queue: [...state.queue],
    currentSchedule: state.currentSchedule ? { ...state.currentSchedule } : null,
    generatedGame: state.generatedGame
      ? {
          ...state.generatedGame,
          payload: state.generatedGame.payload,
        }
      : null,
    upcomingGeneratedGame: state.upcomingGeneratedGame
      ? {
          ...state.upcomingGeneratedGame,
          payload: state.upcomingGeneratedGame.payload,
        }
      : null,
  };
}

function getQueuedCurrentTopic(state) {
  return state.queue[0] || '';
}

function getQueuedUpcomingTopic(state) {
  return state.queue[1] || '';
}

function hasGeneratedGameForSchedule(generatedGame, topic, date) {
  return Boolean(
    generatedGame
    && generatedGame.topic === topic
    && generatedGame.date === date
    && generatedGame.payload
  );
}

// Apply the daily rotation logic to determine what the effective current schedule and generated games should be.
export function getEffectiveDailyModeState(rawState, today = getDailyDateKey()) {
  const state = cloneModeState(sanitizeDailyModeState(rawState));
  const queuedCurrentTopic = getQueuedCurrentTopic(state);
  const tomorrow = getNextDailyDateKey(today);

  if (!queuedCurrentTopic) {
    return {
      queue: [],
      currentSchedule: null,
      generatedGame: null,
      upcomingGeneratedGame: null,
    };
  }

  if (!state.currentSchedule?.topic) {
    // The top queued topic becomes today's live daily game as soon as a schedule is needed.
    state.currentSchedule = { topic: queuedCurrentTopic, date: today };
    if (!hasGeneratedGameForSchedule(state.generatedGame, queuedCurrentTopic, today)) {
      state.generatedGame = null;
    }
    if (!hasGeneratedGameForSchedule(state.upcomingGeneratedGame, getQueuedUpcomingTopic(state), tomorrow)) {
      state.upcomingGeneratedGame = null;
    }
    return state;
  }

  if (state.currentSchedule.date === today) {
    if (state.currentSchedule.topic !== queuedCurrentTopic) {
      // Saving a different topic at the top should switch today's game immediately without
      // waiting for midnight, and force a fresh generated payload for that new topic.
      state.currentSchedule = { topic: queuedCurrentTopic, date: today };
      state.generatedGame = null;
    }
    if (!hasGeneratedGameForSchedule(state.generatedGame, state.currentSchedule.topic, today)) {
      state.generatedGame = null;
    }
    if (!hasGeneratedGameForSchedule(state.upcomingGeneratedGame, getQueuedUpcomingTopic(state), tomorrow)) {
      state.upcomingGeneratedGame = null;
    }
    return state;
  }

  // At midnight, drop yesterday's top topic and promote the already-generated next queued game.
  state.queue = state.queue.slice(1);
  const nextTopic = getQueuedCurrentTopic(state);
  state.currentSchedule = nextTopic ? { topic: nextTopic, date: today } : null;
  state.generatedGame = hasGeneratedGameForSchedule(state.upcomingGeneratedGame, nextTopic, today)
    ? state.upcomingGeneratedGame
    : null;
  state.upcomingGeneratedGame = null;

  return state;
}

export function getEffectiveDailyGames(rawDailyGames, today = getDailyDateKey()) {
  const dailyGames = sanitizeDailyGames(rawDailyGames);
  DAILY_GAME_MODES.forEach((mode) => {
    dailyGames[mode] = getEffectiveDailyModeState(dailyGames[mode], today);
  });
  return dailyGames;
}

function hasGeneratedGameForModeToday(state, today = getDailyDateKey()) {
  return hasGeneratedGameForSchedule(state?.generatedGame, state?.currentSchedule?.topic, today);
}

// Public summary for the frontend to use without providing unnecessary internal details like the full queue and generation timestamps.
export function buildPublicDailyGamesSummary(rawDailyGames, today = getDailyDateKey()) {
  const effective = getEffectiveDailyGames(rawDailyGames, today);
  return DAILY_GAME_MODES.reduce((accumulator, mode) => {
    const state = effective[mode];
    accumulator[mode] = {
      topic: state.currentSchedule?.topic || '',
      date: state.currentSchedule?.date || today,
      available: hasGeneratedGameForModeToday(state, today),
      generated: hasGeneratedGameForModeToday(state, today),
    };
    return accumulator;
  }, {});
}

// The admin summary includes the same info as the public summary, plus the next queued
// game's generated payload so the dev view can preview tomorrow's Promptle before it goes live.
export function buildAdminDailyGamesSummary(rawDailyGames, today = getDailyDateKey()) {
  const effective = getEffectiveDailyGames(rawDailyGames, today);
  return DAILY_GAME_MODES.reduce((accumulator, mode) => {
    const state = effective[mode];
    const upcomingTopic = getQueuedUpcomingTopic(state);
    const upcomingDate = upcomingTopic ? getNextDailyDateKey(today) : '';
    accumulator[mode] = {
      queue: [...state.queue],
      currentSchedule: state.currentSchedule ? { ...state.currentSchedule } : null,
      generatedAt: state.generatedGame?.generatedAt || null,
      hasGeneratedGame: Boolean(state.generatedGame?.payload),
      upcomingSchedule: upcomingTopic
        ? { topic: upcomingTopic, date: upcomingDate }
        : null,
      upcomingGeneratedAt: state.upcomingGeneratedGame?.generatedAt || null,
      hasUpcomingGeneratedGame: hasGeneratedGameForSchedule(
        state.upcomingGeneratedGame,
        upcomingTopic,
        upcomingDate
      ),
      upcomingGeneratedPayload: state.upcomingGeneratedGame?.payload || null,
    };
    return accumulator;
  }, {});
}

export function sanitizeDailyGameQueuesInput(value) {
  return DAILY_GAME_MODES.reduce((accumulator, mode) => {
    accumulator[mode] = sanitizeQueue(value?.[mode]);
    return accumulator;
  }, {});
}

// When the queue is updated keep the same current daily game unless it changed to avoid unneccesary generation
export function mergeDailyGameQueues(existingDailyGames, queueInput) {
  const existing = sanitizeDailyGames(existingDailyGames);
  const nextQueues = sanitizeDailyGameQueuesInput(queueInput);
  const today = getDailyDateKey();

  DAILY_GAME_MODES.forEach((mode) => {
    const previousState = sanitizeDailyModeState(existing[mode]);
    const nextQueue = nextQueues[mode];
    const nextCurrentTopic = nextQueue[0] || '';
    const previousCurrentTopic = previousState.currentSchedule?.topic || '';
    const shouldKeepCurrentSchedule = !!nextCurrentTopic && nextCurrentTopic === previousCurrentTopic;

    existing[mode] = {
      queue: nextQueue,
      // Saving points "current" at the top queue item.
      currentSchedule: nextCurrentTopic
        ? shouldKeepCurrentSchedule
          ? previousState.currentSchedule
          : { topic: nextCurrentTopic, date: today }
        : null,
      // Reuse the current generated payload only if the active topic did not change.
      generatedGame: shouldKeepCurrentSchedule
        && previousState.generatedGame
        && previousState.generatedGame.topic === previousCurrentTopic
        && previousState.generatedGame.date === previousState.currentSchedule?.date
          ? previousState.generatedGame
          : null,
      // Reuse the pre-generated upcoming payload only if it still matches tomorrow's queued topic.
      upcomingGeneratedGame: hasGeneratedGameForSchedule(
        previousState.upcomingGeneratedGame,
        nextQueue[1] || '',
        getNextDailyDateKey(today)
      )
        ? previousState.upcomingGeneratedGame
        : null,
    };
  });

  return existing;
}

async function generateDailyPayload(mode, topic, options) {
  switch (mode) {
    case 'promptle':
      return generatePromptleGameForTopic({ topic, ...options });
    case 'connections':
      return generateConnectionsGameForTopic({ topic, ...options });
    case 'crossword':
      return generateCrosswordGameForTopic({ topic, ...options });
    default:
      throw new Error(`Unsupported daily game mode: ${mode}`);
  }
}

function createUnknownModeError() {
  const error = new Error('Unknown daily game mode.');
  error.statusCode = 404;
  return error;
}

function createMissingScheduleError() {
  const error = new Error('No daily game is scheduled for this mode yet.');
  error.statusCode = 404;
  return error;
}

function createNotReadyError() {
  const error = new Error('Daily game is still loading. Reload the app in a moment.');
  error.statusCode = 503;
  return error;
}

// Reconcile stored state with the current date, then make sure both today's game and the next
// queued game are generated ahead of time when possible.
export async function prepareDailyGamesForToday({
  requestId = null,
  logger = dailyGamesLogger,
  coll = getDevSettingsCollection(),
  generateDailyPayloadFn = generateDailyPayload,
} = {}) {
  const doc = await coll.findOne({ _id: SETTINGS_ID });
  const originalDailyGames = sanitizeDailyGames(doc?.dailyGames);
  const today = getDailyDateKey();
  const tomorrow = getNextDailyDateKey(today);
  const dailyGames = getEffectiveDailyGames(originalDailyGames, today);
  let changed = JSON.stringify(dailyGames) !== JSON.stringify(originalDailyGames);

  for (const mode of DAILY_GAME_MODES) {
    const state = dailyGames[mode];
    // Keep the current daily playable by ensuring today's scheduled game has a cached payload.
    if (state.currentSchedule?.topic && !hasGeneratedGameForModeToday(state, today)) {
      try {
        // Daily games are pre-generated and cached so all players gets the same puzzle for the day.
        const payload = await generateDailyPayloadFn(mode, state.currentSchedule.topic, {
          requestId,
          auth0Id: null,
          logger,
        });
        const generatedAt = new Date().toISOString();
        state.generatedGame = {
          topic: state.currentSchedule.topic,
          date: today,
          generatedAt,
          payload,
        };
        changed = true;

        logger.info('daily_game_generated', {
          requestId,
          mode,
          topic: state.currentSchedule.topic,
          date: today,
          generationSlot: 'current',
        });
      } catch (error) {
        state.generatedGame = null;
        changed = true;

        logger.error('daily_game_generation_failed', {
          requestId,
          mode,
          topic: state.currentSchedule.topic,
          date: today,
          generationSlot: 'current',
          error,
        });
      }
    }

    const upcomingTopic = getQueuedUpcomingTopic(state);
    // Pre-generate the next queued game so the midnight switch can happen instantly.
    if (!upcomingTopic) {
      if (state.upcomingGeneratedGame) {
        state.upcomingGeneratedGame = null;
        changed = true;
      }
      continue;
    }

    if (hasGeneratedGameForSchedule(state.upcomingGeneratedGame, upcomingTopic, tomorrow)) {
      continue;
    }

    try {
      // Keep tomorrow's queued game ready ahead of time so the daily switch at midnight is instant.
      const payload = await generateDailyPayloadFn(mode, upcomingTopic, {
        requestId,
        auth0Id: null,
        logger,
      });
      const generatedAt = new Date().toISOString();
      state.upcomingGeneratedGame = {
        topic: upcomingTopic,
        date: tomorrow,
        generatedAt,
        payload,
      };
      changed = true;

      logger.info('daily_game_generated', {
        requestId,
        mode,
        topic: upcomingTopic,
        date: tomorrow,
        generationSlot: 'upcoming',
      });
    } catch (error) {
      state.upcomingGeneratedGame = null;
      changed = true;

      logger.error('daily_game_generation_failed', {
        requestId,
        mode,
        topic: upcomingTopic,
        date: tomorrow,
        generationSlot: 'upcoming',
        error,
      });
    }
  }

  if (changed) {
    await coll.updateOne(
      { _id: SETTINGS_ID },
      { $set: { dailyGames } },
      { upsert: true }
    );
  }

  return dailyGames;
}

function createMissingUpcomingScheduleError() {
  const error = new Error('No queued daily game is available to preview yet.');
  error.statusCode = 404;
  return error;
}

// Regenerating the next queued daily game lets the dev account inspect and reroll
// tomorrow's payload without touching the live game for today.
export async function regenerateUpcomingDailyGame({
  mode,
  requestId = null,
  logger = dailyGamesLogger,
  coll = getDevSettingsCollection(),
  generateDailyPayloadFn = generateDailyPayload,
} = {}) {
  if (!DAILY_GAME_MODES.includes(mode)) {
    throw createUnknownModeError();
  }

  const doc = await coll.findOne({ _id: SETTINGS_ID });
  const today = getDailyDateKey();
  const tomorrow = getNextDailyDateKey(today);
  const dailyGames = getEffectiveDailyGames(doc?.dailyGames, today);
  const state = dailyGames[mode];
  const upcomingTopic = getQueuedUpcomingTopic(state);

  if (!upcomingTopic) {
    throw createMissingUpcomingScheduleError();
  }

  const payload = await generateDailyPayloadFn(mode, upcomingTopic, {
    requestId,
    auth0Id: null,
    logger,
  });

  state.upcomingGeneratedGame = {
    topic: upcomingTopic,
    date: tomorrow,
    generatedAt: new Date().toISOString(),
    payload,
  };

  await coll.updateOne(
    { _id: SETTINGS_ID },
    { $set: { dailyGames } },
    { upsert: true }
  );

  logger.info('daily_game_regenerated', {
    requestId,
    mode,
    topic: upcomingTopic,
    date: tomorrow,
    generationSlot: 'upcoming',
  });

  return dailyGames;
}

export async function getReadyDailyGame({
  mode,
} = {}) {
  if (!DAILY_GAME_MODES.includes(mode)) {
    throw createUnknownModeError();
  }

  const coll = getDevSettingsCollection();
  const doc = await coll.findOne({ _id: SETTINGS_ID });
  const today = getDailyDateKey();
  const dailyGames = sanitizeDailyGames(doc?.dailyGames);
  const effectiveModeState = getEffectiveDailyModeState(dailyGames[mode], today);
  const rotationChanged = JSON.stringify(effectiveModeState) !== JSON.stringify(sanitizeDailyModeState(dailyGames[mode]));

  // If the rotation logic resulted in a different effective state than what is currently stored
  // update the stored state so it will be correct for the next request and for the admin view.
  if (rotationChanged) {
    await coll.updateOne(
      { _id: SETTINGS_ID },
      { $set: { [`dailyGames.${mode}`]: effectiveModeState } },
      { upsert: true }
    );
  }

  if (!effectiveModeState.currentSchedule?.topic) {
    throw createMissingScheduleError();
  }

  if (!hasGeneratedGameForModeToday(effectiveModeState, today)) {
    throw createNotReadyError();
  }

  return {
    mode,
    topic: effectiveModeState.currentSchedule.topic,
    date: today,
    payload: effectiveModeState.generatedGame.payload,
    generatedAt: effectiveModeState.generatedGame.generatedAt || null,
  };
}
