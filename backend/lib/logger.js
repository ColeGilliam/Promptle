const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
};

const STDERR_LEVELS = new Set(['warn', 'error', 'fatal']);
const MAX_STRING_LENGTH = 1200;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 5;

function parseBoolean(value) {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function resolveLogLevel() {
  const configuredLevel = String(process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (configuredLevel in LEVEL_PRIORITY) {
    return configuredLevel;
  }

  return 'warn';
}

function truncateString(value) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}… [truncated ${value.length - MAX_STRING_LENGTH} chars]`;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function serializeValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    // Keep errors readable in JSON logs instead of losing them to "{}".
    const serializedError = {
      name: value.name,
      message: truncateString(value.message || ''),
      stack: value.stack ? truncateString(value.stack) : undefined,
    };

    for (const [key, entry] of Object.entries(value)) {
      if (serializedError[key] === undefined) {
        serializedError[key] = serializeValue(entry, depth + 1, seen);
      }
    }

    return serializedError;
  }

  if (Buffer.isBuffer(value)) {
    return {
      type: 'Buffer',
      length: value.length,
    };
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => serializeValue(entry, depth + 1, seen));

    if (value.length > MAX_ARRAY_LENGTH) {
      items.push(`[truncated ${value.length - MAX_ARRAY_LENGTH} items]`);
    }

    return items;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    if (depth >= MAX_DEPTH) {
      return '[MaxDepth]';
    }

    seen.add(value);

    const serializedObject = {};
    for (const [key, entry] of Object.entries(value)) {
      serializedObject[key] = serializeValue(entry, depth + 1, seen);
    }

    seen.delete(value);
    return serializedObject;
  }

  return String(value);
}

function mergeContext(parts) {
  if (!parts.length) {
    return {};
  }

  const merged = {};
  const extra = [];

  for (const part of parts) {
    if (part == null) {
      continue;
    }

    if (part instanceof Error) {
      if (!merged.error) {
        merged.error = serializeValue(part);
      } else {
        // Preserve additional positional arguments without clobbering the primary error field.
        extra.push(serializeValue(part));
      }
      continue;
    }

    if (isPlainObject(part)) {
      Object.assign(merged, serializeValue(part));
      continue;
    }

    extra.push(serializeValue(part));
  }

  if (extra.length === 1) {
    merged.context = extra[0];
  } else if (extra.length > 1) {
    merged.context = extra;
  }

  return merged;
}

export function createLogger(bindings = {}) {
  function isLevelEnabled(targetLevel) {
    const activeLevel = resolveLogLevel();
    return LEVEL_PRIORITY[targetLevel] >= LEVEL_PRIORITY[activeLevel];
  }

  function writeLog(targetLevel, message, ...contextParts) {
    if (!isLevelEnabled(targetLevel)) {
      return;
    }

    // Child logger bindings are merged into every line so callers only pass request-specific context.
    const payload = {
      timestamp: new Date().toISOString(),
      level: targetLevel,
      message,
      ...serializeValue(bindings),
      ...mergeContext(contextParts),
    };

    const line = `${JSON.stringify(payload)}\n`;
    if (STDERR_LEVELS.has(targetLevel)) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }

  return {
    get level() {
      return resolveLogLevel();
    },
    child(extraBindings = {}) {
      return createLogger({ ...bindings, ...extraBindings });
    },
    isLevelEnabled,
    debug(message, ...contextParts) {
      writeLog('debug', message, ...contextParts);
    },
    info(message, ...contextParts) {
      writeLog('info', message, ...contextParts);
    },
    warn(message, ...contextParts) {
      writeLog('warn', message, ...contextParts);
    },
    error(message, ...contextParts) {
      writeLog('error', message, ...contextParts);
    },
    fatal(message, ...contextParts) {
      writeLog('fatal', message, ...contextParts);
    },
  };
}

export const appLogger = createLogger({
  service: 'backend',
});
