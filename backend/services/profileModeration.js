import OpenAI from 'openai';
import { OPENAI_API_KEY } from '../config/config.js';
import { getFlaggedCategories } from './topicModeration.js';

export const PROFILE_TEXT_MODERATION_MODEL = 'omni-moderation-latest';
export const MIN_PROFILE_USERNAME_LENGTH = 3;
export const MAX_PROFILE_USERNAME_LENGTH = 16;
export const MAX_PROFILE_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
]);

export const PROFILE_USERNAME_NOT_ALLOWED_ERROR =
  'That username is not allowed. Use 3-16 standard characters and avoid promotional or staff-like names.';
export const USERNAME_VALIDATION_FAILED_ERROR =
  'Unable to validate that username right now. Please try again.';
export const PROFILE_IMAGE_NOT_ALLOWED_ERROR =
  'Profile picture must be appropriate.';
export const PFP_VALIDATION_FAILED_ERROR =
  'Unable to validate that profile picture right now. Please try again.';

// Usernames must start and end with a letter or number, with optional hyphens in the middle.
const USERNAME_ALLOWED_REGEX = new RegExp(
  `^[A-Za-z0-9](?:[A-Za-z0-9-]{1,${MAX_PROFILE_USERNAME_LENGTH - 2}}[A-Za-z0-9])?$`
);
// Reject accented characters, emojis, and other non-ASCII tricks before regex checks.
const ASCII_PRINTABLE_REGEX = /^[\x20-\x7E]+$/;
// Profile pictures are only accepted as base64 PNG/JPG data URLs.
const BASE64_IMAGE_REGEX =
  /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/;

const RESERVED_USERNAME_TOKENS = new Set([
  'admin',
  'administrator',
  'dev',
  'developer',
  'founder',
  'mod',
  'moderator',
  'official',
  'owner',
  'staff',
  'support',
  'system',
  'team',
]);

const PROMOTION_USERNAME_TOKENS = new Set([
  'cashapp',
  'discord',
  'download',
  'http',
  'https',
  'instagram',
  'paypal',
  'promo',
  'reddit',
  'telegram',
  'tiktok',
  'twitch',
  'venmo',
  'www',
  'youtube',
]);

const BANNED_USERNAME_TOKENS = new Set([
  'anus',
  'arse',
  'ass',
  'asshole',
  'bastard',
  'bitch',
  'boob',
  'chink',
  'cock',
  'coon',
  'cunt',
  'damn',
  'dick',
  'dyke',
  'fag',
  'faggot',
  'fuck',
  'fucker',
  'gay',
  'gook',
  'hoe',
  'jap',
  'kike',
  'motherfucker',
  'nazi',
  'nigger',
  'nigga',
  'porn',
  'pussy',
  'queer',
  'rape',
  'rapist',
  'retard',
  'sex',
  'shit',
  'slut',
  'spic',
  'tit',
  'tranny',
  'twat',
  'whore',
]);

const LEETSPEAK_MAP = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};

export const profileModerationOpenAI = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Trims usernames and collapses repeated whitespace into single spaces.
function collapseWhitespace(value = '') {
  return value.replace(/\s+/g, ' ').trim();
}

// Converts accented or stylized characters into their basic ASCII form for comparison.
function toBasicAscii(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '');
}

// Normalizes a token before profanity and slur checks.
function normalizeToken(token = '') {
  return token
    .toLowerCase()
    .split('')
    // Normalize simple leetspeak before banned-word checks.
    .map((char) => LEETSPEAK_MAP[char] ?? char)
    .join('');
}

// Splits a username into searchable tokens for reserved and promotional word checks.
function getUsernameTokens(value = '') {
  return collapseWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .map(normalizeToken)
    .flatMap((token) => token.split('-'))
    .filter(Boolean);
}

// Builds a compact username string for substring banned-word checks.
function getCompactNormalizedUsername(value = '') {
  // Remove separators so attached banned words like "fuckyou" still match.
  return normalizeToken(collapseWhitespace(value).toLowerCase()).replace(/[^a-z0-9]+/g, '');
}

// Detects obvious website-style names before sending anything to moderation.
function hasWebsitePattern(value = '') {
  const lower = value.toLowerCase();
  return (
    /\b(?:https?|www)\b/.test(lower) ||
    /\b[a-z0-9-]+\.(?:com|net|org|gg|io|ai|co|app|dev|tv|me|ly|xyz|info|gg)\b/.test(lower)
  );
}

// Creates a consistent validation result for local rule failures.
function createValidationFailure(code, error, normalizedUsername = '') {
  return {
    isValid: false,
    code,
    error,
    normalizedUsername,
  };
}

// Applies all local username rules before optional OpenAI moderation.
export function validateProfileUsernameRules(username) {
  const normalizedUsername = collapseWhitespace(String(username ?? ''));
  const asciiUsername = toBasicAscii(normalizedUsername);

  if (!normalizedUsername) {
    return createValidationFailure('username_required', 'Enter a username.');
  }

  if (normalizedUsername.length < MIN_PROFILE_USERNAME_LENGTH) {
    return createValidationFailure(
      'username_too_short',
      `Usernames must be at least ${MIN_PROFILE_USERNAME_LENGTH} characters.`,
      normalizedUsername
    );
  }

  if (normalizedUsername.length > MAX_PROFILE_USERNAME_LENGTH) {
    return createValidationFailure(
      'username_too_long',
      `Usernames must be ${MAX_PROFILE_USERNAME_LENGTH} characters or fewer.`,
      normalizedUsername
    );
  }

  if (asciiUsername !== normalizedUsername || !ASCII_PRINTABLE_REGEX.test(normalizedUsername)) {
    return createValidationFailure(
      'username_non_ascii',
      'Use only standard English letters, numbers, and hyphens.',
      normalizedUsername
    );
  }

  if (!USERNAME_ALLOWED_REGEX.test(normalizedUsername)) {
    return createValidationFailure(
      'username_invalid_characters',
      'Use only letters, numbers, and hyphens.',
      normalizedUsername
    );
  }

  // Block direct references to the app before checking more general reserved terms.
  const compactLower = normalizedUsername.toLowerCase().replace(/[\s'-]+/g, '');
  if (compactLower.includes('promptle')) {
    return createValidationFailure(
      'username_impersonation',
      'Usernames cannot reference Promptle or look official.',
      normalizedUsername
    );
  }

  if (hasWebsitePattern(normalizedUsername)) {
    return createValidationFailure(
      'username_website',
      'Usernames cannot contain website or domain names.',
      normalizedUsername
    );
  }

  const compactNormalizedUsername = getCompactNormalizedUsername(normalizedUsername);
  // Block banned words even when they appear inside a larger username.
  if ([...BANNED_USERNAME_TOKENS].some((word) => compactNormalizedUsername.includes(word))) {
    return createValidationFailure(
      'username_banned_word',
      'That username contains a blocked word.',
      normalizedUsername
    );
  }

  const tokens = getUsernameTokens(normalizedUsername);

  if (tokens.some((token) => PROMOTION_USERNAME_TOKENS.has(token))) {
    return createValidationFailure(
      'username_promotion',
      'Usernames cannot advertise websites, downloads, or contact handles.',
      normalizedUsername
    );
  }

  if (tokens.some((token) => RESERVED_USERNAME_TOKENS.has(token))) {
    return createValidationFailure(
      'username_impersonation',
      'Usernames cannot impersonate staff, moderators, or developers.',
      normalizedUsername
    );
  }

  return {
    isValid: true,
    normalizedUsername,
  };
}

// Validates the uploaded profile picture format and size before moderation.
export function validateProfileImageData(profilePic) {
  if (!profilePic) {
    return {
      isValid: true,
      normalizedProfilePic: '',
      bytes: 0,
      mimeType: '',
    };
  }

  if (typeof profilePic !== 'string') {
    return {
      isValid: false,
      code: 'profile_image_invalid',
      error: 'Profile pictures must be uploaded image files.',
    };
  }

  const match = profilePic.match(BASE64_IMAGE_REGEX);
  if (!match) {
    return {
      isValid: false,
      code: 'profile_image_invalid',
      error: 'Use a PNG or JPG image uploaded from your device.',
    };
  }

  const [, mimeType, base64Payload] = match;
  if (!ALLOWED_PROFILE_IMAGE_MIME_TYPES.has(mimeType)) {
    return {
      isValid: false,
      code: 'profile_image_invalid_type',
      error: 'Only PNG and JPG profile pictures are allowed.',
    };
  }

  const bytes = Buffer.byteLength(base64Payload, 'base64');
  if (!bytes) {
    return {
      isValid: false,
      code: 'profile_image_empty',
      error: 'Choose a non-empty image file.',
    };
  }

  if (bytes > MAX_PROFILE_IMAGE_BYTES) {
    return {
      isValid: false,
      code: 'profile_image_too_large',
      error: 'Profile pictures must be 2 MB or smaller.',
    };
  }

  return {
    isValid: true,
    normalizedProfilePic: profilePic,
    bytes,
    mimeType,
  };
}

// Runs local username rules first, then OpenAI moderation if available.
export async function moderateProfileUsername({
  openaiClient = profileModerationOpenAI,
  username,
  model = PROFILE_TEXT_MODERATION_MODEL,
} = {}) {
  // Run cheap local checks first so obvious rejects never need an API call.
  const validation = validateProfileUsernameRules(username);
  if (!validation.isValid) {
    return {
      allowed: false,
      code: validation.code,
      error: validation.error,
      normalizedUsername: validation.normalizedUsername,
      source: 'rules',
      flaggedCategories: [],
    };
  }

  if (!openaiClient?.moderations?.create) {
    return {
      allowed: true,
      normalizedUsername: validation.normalizedUsername,
      flaggedCategories: [],
      moderationId: null,
      moderationModel: null,
      source: 'rules',
    };
  }

  const moderationResponse = await openaiClient.moderations.create({
    model,
    input: validation.normalizedUsername,
  });

  // The API should return one moderation result for this single username input.
  const moderationResult = moderationResponse?.results?.[0];
  if (!moderationResult) {
    throw new Error('Username moderation response did not include a result.');
  }

  const flaggedCategories = getFlaggedCategories(moderationResult.categories);
  if (moderationResult.flagged || flaggedCategories.length) {
    return {
      allowed: false,
      code: 'username_flagged',
      error: PROFILE_USERNAME_NOT_ALLOWED_ERROR,
      normalizedUsername: validation.normalizedUsername,
      flaggedCategories,
      moderationId: moderationResponse.id ?? null,
      moderationModel: moderationResponse.model ?? model,
      source: 'openai',
    };
  }

  return {
    allowed: true,
    normalizedUsername: validation.normalizedUsername,
    flaggedCategories,
    moderationId: moderationResponse.id ?? null,
    moderationModel: moderationResponse.model ?? model,
    source: 'openai',
  };
}

// Runs local image checks first, then OpenAI image moderation if needed.
export async function moderateProfileImage({
  openaiClient = profileModerationOpenAI,
  profilePic,
  moderationModel = PROFILE_TEXT_MODERATION_MODEL,
} = {}) {
  // Validate the file format locally before sending image bytes to moderation.
  const validation = validateProfileImageData(profilePic);
  if (!validation.isValid) {
    return {
      allowed: false,
      code: validation.code,
      error: validation.error,
      reasons: [validation.code],
      source: 'rules',
    };
  }

  if (!validation.normalizedProfilePic) {
    return {
      allowed: true,
      reasons: [],
      source: 'rules',
      // A blank profile picture means the user is not setting a custom image.
      normalizedProfilePic: '',
    };
  }

  if (!openaiClient?.moderations?.create) {
    throw new Error('Image moderation client is unavailable.');
  }

  const moderationResponse = await openaiClient.moderations.create({
    model: moderationModel,
    input: [
      {
        type: 'image_url',
        image_url: {
          url: validation.normalizedProfilePic,
        },
      },
    ],
  });

  // The API should return one moderation result for this single image input.
  const moderationResult = moderationResponse?.results?.[0];
  if (!moderationResult) {
    throw new Error('Image moderation response did not include a result.');
  }

  const flaggedCategories = getFlaggedCategories(moderationResult.categories);
  if (moderationResult.flagged || flaggedCategories.length) {
    return {
      allowed: false,
      code: 'profile_image_flagged',
      error: PROFILE_IMAGE_NOT_ALLOWED_ERROR,
      reasons: flaggedCategories,
      moderationId: moderationResponse.id ?? null,
      moderationModel: moderationResponse.model ?? moderationModel,
      source: 'openai-moderation',
    };
  }

  return {
    allowed: true,
    reasons: [],
    summary: '',
    moderationId: moderationResponse.id ?? null,
    moderationModel: moderationResponse.model ?? moderationModel,
    source: 'openai-moderation',
    normalizedProfilePic: validation.normalizedProfilePic,
  };
}
