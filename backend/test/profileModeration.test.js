import test from 'node:test';
import assert from 'node:assert/strict';

const { validateProfileUsernameRules } = await import('../services/profileModeration.js');

test('validateProfileUsernameRules keeps prompt-like and security-adjacent usernames valid when structurally safe', () => {
  const allowedUsernames = [
    'ActAsAdmin',
    'IgnorePrompt',
    'SystemPrompt',
    'PythonFan',
    'BashPlayer',
    'HtmlHero',
    'SecretAgent',
    'PromptFan',
    'Base64Fan',
  ];

  for (const username of allowedUsernames) {
    const result = validateProfileUsernameRules(username);
    assert.equal(result.isValid, true, username);
    assert.equal(result.normalizedUsername, username, username);
  }
});

test('validateProfileUsernameRules rejects script and command injection characters', () => {
  const rejectedUsernames = [
    '<script>',
    'alert(1)',
    'rm -rf',
    'curl|sh',
    '$(whoami)',
    'name;drop',
    'user&&cmd',
    'http://site',
  ];

  for (const username of rejectedUsernames) {
    const result = validateProfileUsernameRules(username);
    assert.equal(result.isValid, false, username);
    assert.equal(result.code, 'username_invalid_characters', username);
  }
});
