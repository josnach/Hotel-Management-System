import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
    /** Encrypts 2FA secrets in the database. Set a long random value in production (falls back to JWT_SECRET). */
  twoFactorKey: process.env.TWO_FACTOR_KEY ?? process.env.JWT_SECRET ?? 'dev-secret-change-me',
  /** Comma-separated roles that MUST enrol in 2FA, e.g. "ADMIN,MANAGER". Empty = optional for everyone. */
  requireTwoFactorRoles: (process.env.REQUIRE_2FA_ROLES ?? '').split(',').map((r) => r.trim()).filter(Boolean),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  autoExtensionCron: process.env.AUTO_EXTENSION_CRON ?? '0 14 * * *',
  vatRate: 0.075,
  serviceChargeRate: 0.1,
  checkoutHour: 12,
  hotelName: process.env.HOTEL_NAME ?? 'Koraf Hotels',

    hotelAddress: process.env.HOTEL_ADDRESS ?? '',
  hotelPhone: process.env.HOTEL_PHONE ?? '',
  hotelEmail: process.env.HOTEL_EMAIL ?? '',
  pdfFontPath: process.env.PDF_FONT_PATH ?? '',
  pdfBoldFontPath: process.env.PDF_BOLD_FONT_PATH ?? '',
  hotelTz: process.env.TZ ?? 'Africa/Lagos',
  /** Public base URL of this API (used in signed folio links) and of the web app (dashboard link). */
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',

    mail: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? '',
  },
  sms: {
    baseUrl: process.env.TERMII_BASE_URL ?? 'https://api.ng.termii.com',
    apiKey: process.env.TERMII_API_KEY ?? '',
    senderId: process.env.TERMII_SENDER_ID ?? '',
    channel: process.env.TERMII_CHANNEL ?? 'generic',
  },
  autoEmailFolio: process.env.AUTO_EMAIL_FOLIO === 'true',
  whatsapp: {
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? '',
    accessToken: process.env.WA_ACCESS_TOKEN ?? '',
    verifyToken: process.env.WA_VERIFY_TOKEN ?? '',
    appSecret: process.env.WA_APP_SECRET ?? '',
    apiVersion: process.env.WA_API_VERSION ?? 'v21.0',
  },
};

export const mailConfigured = () => !!(config.mail.host && config.mail.from);
export const smsConfigured = () => !!(config.sms.apiKey && config.sms.senderId);

export const whatsappConfigured = () => !!(config.whatsapp.phoneNumberId && config.whatsapp.accessToken);
