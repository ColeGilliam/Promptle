import { getDevSettingsCollection } from '../config/db.js';

const SETTINGS_ID = 'global';

const DEFAULT_SETTINGS = {
  allowGuestsCreateRooms: false,
  allowAllAIGeneration: false,
  showPromptleAnswerAtTop: false,
};

export async function fetchDevSettings() {
  try {
    const doc = await getDevSettingsCollection().findOne({ _id: SETTINGS_ID });
    return {
      ...DEFAULT_SETTINGS,
      ...(doc || {}),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
