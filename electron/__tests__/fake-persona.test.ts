import { describe, it, expect } from 'vitest';
import { generateFakePersona, extractValidationFromEmail } from '../fake-persona';

describe('Fake Persona & Email Validation test suite', () => {
  it('should generate valid fake persona details', () => {
    const persona = generateFakePersona();
    expect(persona.fullName).toBeTruthy();
    expect(persona.email).toContain('@tora-mail.tmp');
    expect(persona.password).toHaveLength(16);
  });

  it('should extract confirmation link from verification email body', () => {
    const mockEmail = `
      Hello Alex,
      Thank you for registering. Please click the link below to confirm your account:
      https://example.com/verify?token=abc123xyz789
      If you did not request this, please ignore this email.
    `;

    const result = extractValidationFromEmail(mockEmail);
    expect(result.hasValidationEmail).toBe(true);
    expect(result.confirmationUrl).toBe('https://example.com/verify?token=abc123xyz789');
  });

  it('should extract 6-digit PIN verification code if present', () => {
    const mockEmail = 'Your verification code for Tora Web is 849201. Do not share it.';
    const result = extractValidationFromEmail(mockEmail);
    expect(result.hasValidationEmail).toBe(true);
    expect(result.verificationCode).toBe('849201');
  });
});
