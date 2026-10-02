export interface FakePersona {
  firstName: string;
  lastName: string;
  fullName: string;
  username: string;
  email: string;
  password: string;
  createdAt: number;
}

export interface ValidationEmailResult {
  hasValidationEmail: boolean;
  confirmationUrl?: string;
  verificationCode?: string;
  subject?: string;
}

const FIRST_NAMES = ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Sam', 'Chris', 'Pat', 'Riley', 'Casey', 'Avery'];
const LAST_NAMES = ['Vance', 'Sterling', 'Mercer', 'DuPont', 'Sinclair', 'Vanguard', 'Novak', 'Hayes', 'Blake', 'Rousseau'];

/**
 * Generates a complete fake persona with strong password and disposable email address.
 */
export function generateFakePersona(): FakePersona {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const randNum = Math.floor(100 + Math.random() * 9000);
  
  const username = `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${randNum}`;
  const domain = 'tora-mail.tmp';
  const email = `${username}@${domain}`;
  
  // Strong 16-char password
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    username,
    email,
    password,
    createdAt: Date.now(),
  };
}

/**
 * Parses email HTML/text body to extract confirmation links or 6-digit verification codes.
 */
export function extractValidationFromEmail(emailBody: string): ValidationEmailResult {
  if (!emailBody) return { hasValidationEmail: false };

  // RegEx for confirmation / verification URLs
  const urlRegex = /(https?:\/\/[^\s"'<>]+(?:confirm|verify|activate|validate|auth|token)[^\s"'<>]*)/i;
  const matchUrl = emailBody.match(urlRegex);

  // RegEx for 6-digit OTP code
  const codeRegex = /\b(\d{6})\b/;
  const matchCode = emailBody.match(codeRegex);

  if (matchUrl || matchCode) {
    return {
      hasValidationEmail: true,
      confirmationUrl: matchUrl ? matchUrl[1] : undefined,
      verificationCode: matchCode ? matchCode[1] : undefined,
    };
  }

  return { hasValidationEmail: false };
}
