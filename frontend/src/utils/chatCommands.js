export const COMMAND_REGEX = /^\/(\w+)(?:\s+([\s\S]*))?$/;

export const SUPPORTED_COMMANDS = ['me', 'sing', 'shout', 'cry', 'dice', 'diceN'];

export const UNKNOWN_COMMAND_HELP = 'Unknown command. Available: /me, /sing, /shout, /cry, /dice, /diceN';

export const parseSlashCommand = (input = '') => {
  const match = String(input).trim().match(COMMAND_REGEX);
  if (!match) return null;

  return {
    command: String(match[1] || '').toLowerCase(),
    argsRaw: String(match[2] || '').trim()
  };
};

const rollDice = (sides) => {
  const roll = Math.floor(Math.random() * sides) + 1;
  return { sides, roll };
};

const ensureArgs = (args, usage) => {
  if (!args) {
    return { ok: false, error: usage };
  }
  return { ok: true };
};

export const runSlashCommand = ({ command, argsRaw = '', username = 'user' }) => {
  const args = String(argsRaw || '').trim();
  const normalizedName = String(username || 'user').trim() || 'user';

  if (command === 'me') {
    const validation = ensureArgs(args, 'Usage: /me <action>');
    if (!validation.ok) return validation;
    return {
      ok: true,
      payload: {
        messageType: 'action',
        plaintext: args,
        commandData: {
          command: 'me',
          processedContent: `* ${normalizedName} ${args}`
        }
      }
    };
  }

  if (command === 'sing') {
    const validation = ensureArgs(args, 'Usage: /sing <text>');
    if (!validation.ok) return validation;
    return {
      ok: true,
      payload: {
        messageType: 'text',
        plaintext: `♪ ${args} ♪`,
        commandData: null
      }
    };
  }

  if (command === 'shout') {
    const validation = ensureArgs(args, 'Usage: /shout <text>');
    if (!validation.ok) return validation;
    return {
      ok: true,
      payload: {
        messageType: 'text',
        plaintext: `${args.toUpperCase()}!`,
        commandData: null
      }
    };
  }

  if (command === 'cry') {
    const validation = ensureArgs(args, 'Usage: /cry <text>');
    if (!validation.ok) return validation;
    return {
      ok: true,
      payload: {
        messageType: 'text',
        plaintext: `${args} 😢`,
        commandData: null
      }
    };
  }

  if (command === 'dice' || command.startsWith('dice')) {
    const suffix = command === 'dice' ? '' : command.slice(4);
    if (suffix && !/^\d+$/.test(suffix)) {
      return { ok: false, error: UNKNOWN_COMMAND_HELP };
    }

    const sides = suffix ? parseInt(suffix, 10) : 6;
    if (!Number.isFinite(sides) || sides <= 0) {
      return { ok: false, error: 'Dice sides must be a positive integer.' };
    }

    const result = rollDice(sides);
    const processedContent = `🎲 ${normalizedName} rolled a ${result.roll} (1-${result.sides})`;
    return {
      ok: true,
      payload: {
        messageType: 'command',
        plaintext: processedContent,
        commandData: {
          command: suffix ? `dice${result.sides}` : 'dice',
          result,
          processedContent
        }
      }
    };
  }

  return { ok: false, error: UNKNOWN_COMMAND_HELP };
};
