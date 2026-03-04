export const COMMAND_REGEX = /^\/(\w+)(?:\s+([\s\S]*))?$/;

export const SUPPORTED_COMMANDS = ['join', 'leave', 'nick', 'msg', 'list'];

export const UNKNOWN_COMMAND_HELP = 'Unknown command. Available: /join, /leave, /nick, /msg, /list';

export const parseSlashCommand = (input = '') => {
  const match = String(input).trim().match(COMMAND_REGEX);
  if (!match) return null;

  return {
    command: String(match[1] || '').toLowerCase(),
    argsRaw: String(match[2] || '').trim()
  };
};

export const parseCommandArguments = (command, argsRaw = '') => {
  const args = String(argsRaw || '').trim();

  switch (command) {
    case 'join': {
      if (!args) return { ok: false, error: 'Usage: /join [room]' };
      return { ok: true, data: { roomQuery: args } };
    }
    case 'leave':
    case 'list':
      return { ok: true, data: {} };
    case 'nick': {
      if (!args) return { ok: false, error: 'Usage: /nick [name]' };
      const nickname = args.slice(0, 32);
      if (!/^[A-Za-z0-9_-]{2,32}$/.test(nickname)) {
        return { ok: false, error: 'Nickname must be 2-32 chars: letters, numbers, _ or -' };
      }
      return { ok: true, data: { nickname } };
    }
    case 'msg': {
      const [target, ...rest] = args.split(/\s+/);
      const message = rest.join(' ').trim();
      if (!target || !message) {
        return { ok: false, error: 'Usage: /msg [user] [message]' };
      }
      return { ok: true, data: { target: target.slice(0, 64), message: message.slice(0, 2000) } };
    }
    default:
      return { ok: false, error: UNKNOWN_COMMAND_HELP };
  }
};

