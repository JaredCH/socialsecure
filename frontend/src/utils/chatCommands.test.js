import {
  parseSlashCommand,
  runSlashCommand,
  UNKNOWN_COMMAND_HELP
} from './chatCommands';

describe('chatCommands', () => {
  it('parses slash commands', () => {
    expect(parseSlashCommand('/me waves')).toEqual({ command: 'me', argsRaw: 'waves' });
    expect(parseSlashCommand('hello')).toBeNull();
  });

  it('builds action payload for /me', () => {
    const result = runSlashCommand({ command: 'me', argsRaw: 'waves', username: 'alice' });
    expect(result.ok).toBe(true);
    expect(result.payload).toEqual({
      messageType: 'action',
      plaintext: 'waves',
      commandData: {
        command: 'me',
        processedContent: '* alice waves'
      }
    });
  });

  it('builds transformed text payloads for sing/shout', () => {
    expect(runSlashCommand({ command: 'sing', argsRaw: 'hello', username: 'alice' }).payload.plaintext).toBe('♪ hello ♪');
    expect(runSlashCommand({ command: 'shout', argsRaw: 'hello', username: 'alice' }).payload.plaintext).toBe('HELLO!');
  });

  it('builds action payloads for cry/runaway/scream', () => {
    expect(runSlashCommand({ command: 'cry', username: 'alice' }).payload.plaintext).toBe('alice cries');
    expect(runSlashCommand({ command: 'runaway', username: 'alice' }).payload.plaintext).toBe('alice runs away');
    expect(runSlashCommand({ command: 'scream', username: 'alice' }).payload.plaintext).toBe('alice SCREAMS');
  });

  it('builds dice command payloads including diceN', () => {
    const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const diceResult = runSlashCommand({ command: 'dice', username: 'alice' });
    const dice20Result = runSlashCommand({ command: 'dice20', username: 'alice' });

    expect(diceResult.ok).toBe(true);
    expect(diceResult.payload.plaintext).toBe('🎲 alice rolled a 4 (1-6)');
    expect(diceResult.payload.commandData.result).toEqual({ sides: 6, roll: 4 });

    expect(dice20Result.ok).toBe(true);
    expect(dice20Result.payload.plaintext).toBe('🎲 alice rolled a 11 (1-20)');
    expect(dice20Result.payload.commandData.result).toEqual({ sides: 20, roll: 11 });

    randomSpy.mockRestore();
  });

  it('returns unknown command help for unsupported commands', () => {
    expect(runSlashCommand({ command: 'join', argsRaw: 'room' })).toEqual({ ok: false, error: UNKNOWN_COMMAND_HELP });
    expect(runSlashCommand({ command: 'dice0' })).toEqual({ ok: false, error: 'Dice sides must be a positive integer.' });
  });
});
