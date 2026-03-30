type SendSmsCodeResult = {
  provider: 'smsapi' | 'smswapi';
  eventId?: string;
};

type VerifySmsCodeResult =
  | { success: true }
  | { success: false; error: string; code?: 'wrong_code' | 'expired_code' | 'provider_error' };

export async function sendVolunteerPortalSmsCode(phoneNumber: string): Promise<SendSmsCodeResult> {
  if (hasSmsWapiConfig()) {
    return sendVolunteerPortalSmsCodeViaSmsWapi(phoneNumber);
  }

  return sendVolunteerPortalSmsCodeViaSmsApi(phoneNumber);
}

export async function verifyVolunteerPortalSmsCode(
  phoneNumber: string,
  code: string,
): Promise<VerifySmsCodeResult> {
  if (hasSmsWapiConfig()) {
    return verifyVolunteerPortalSmsCodeViaSmsWapi(code);
  }

  return verifyVolunteerPortalSmsCodeViaSmsApi(phoneNumber, code);
}

async function sendVolunteerPortalSmsCodeViaSmsWapi(phoneNumber: string): Promise<SendSmsCodeResult> {
  const params = new URLSearchParams({
    secret: getSmsWapiApiSecret(),
    phone: phoneNumber,
    message:
      process.env.SMSWAPI_OTP_TEMPLATE ||
      process.env.SMSWAPY_OTP_TEMPLATE ||
      'Codul tău DGPT este {{otp}}. Valabil 3 minute.',
    type: process.env.SMSWAPI_OTP_TYPE || process.env.SMSWAPY_OTP_TYPE || 'sms',
    expire: process.env.SMSWAPI_OTP_EXPIRE || process.env.SMSWAPY_OTP_EXPIRE || '180',
  });

  const mode = process.env.SMSWAPI_MODE || process.env.SMSWAPY_MODE || 'credits';
  const gateway = process.env.SMSWAPI_GATEWAY || process.env.SMSWAPY_GATEWAY;
  const device = process.env.SMSWAPI_DEVICE || process.env.SMSWAPY_DEVICE;
  const sim = process.env.SMSWAPI_SIM || process.env.SMSWAPY_SIM;
  const countryCode = process.env.SMSWAPI_COUNTRY_CODE || process.env.SMSWAPY_COUNTRY_CODE;

  params.set('mode', mode);

  if (gateway) {
    params.set('gateway', gateway);
  }

  if (device) {
    params.set('device', device);
  }

  if (sim) {
    params.set('sim', sim);
  }

  if (countryCode) {
    params.set('country_code', countryCode);
  }

  const response = await fetch(`${getSmsWapiBaseUrl()}/send/otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    cache: 'no-store',
  });

  const data = await parseJsonSafely(response);
  if (!response.ok || !isSmsWapiSuccess(data)) {
    throw new Error(getSmsWapiMessage(data) || 'Nu am putut trimite codul prin SMS.');
  }

  return {
    provider: 'smswapi',
    eventId: getSmsWapiEventId(data),
  };
}

async function verifyVolunteerPortalSmsCodeViaSmsWapi(code: string): Promise<VerifySmsCodeResult> {
  const params = new URLSearchParams({
    secret: getSmsWapiApiSecret(),
    otp: code,
  });

  const response = await fetch(`${getSmsWapiBaseUrl()}/get/otp?${params.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });

  const data = await parseJsonSafely(response);
  if (response.ok && isSmsWapiSuccess(data)) {
    return { success: true };
  }

  const message = getSmsWapiMessage(data) || 'Serviciul SMS nu a putut valida codul.';
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('expir')) {
    return { success: false, error: 'Codul a expirat. Cere unul nou.', code: 'expired_code' };
  }

  if (
    normalizedMessage.includes('invalid') ||
    normalizedMessage.includes('wrong') ||
    normalizedMessage.includes('incorrect') ||
    normalizedMessage.includes('not found')
  ) {
    return { success: false, error: 'Codul introdus este invalid.', code: 'wrong_code' };
  }

  return { success: false, error: message, code: 'provider_error' };
}

async function sendVolunteerPortalSmsCodeViaSmsApi(phoneNumber: string): Promise<SendSmsCodeResult> {
  const senderName = process.env.SMSAPI_SENDER || process.env.SMSWAPY_SENDER || 'Test';
  const content =
    process.env.SMSAPI_OTP_TEMPLATE ||
    process.env.SMSWAPY_OTP_TEMPLATE ||
    'Codul tău de acces DGPT este [%code%]. Valabil 3 minute.';

  const params = new URLSearchParams({
    phone_number: phoneNumber,
    from: senderName,
    content,
    fast: '1',
  });

  const response = await fetch(`${getSmsApiBaseUrl()}/mfa/codes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSmsApiAccessToken()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
    cache: 'no-store',
  });

  const data = await parseJsonSafely(response);
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' && data.message) ||
      'Nu am putut trimite codul prin SMS.';
    throw new Error(message);
  }

  return {
    provider: 'smsapi',
    eventId:
      data && typeof data === 'object' && 'id' in data && typeof data.id === 'string'
        ? data.id
        : undefined,
  };
}

async function verifyVolunteerPortalSmsCodeViaSmsApi(
  phoneNumber: string,
  code: string,
): Promise<VerifySmsCodeResult> {
  const response = await fetch(`${getSmsApiBaseUrl()}/mfa/codes/verifications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getSmsApiAccessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      code,
    }),
    cache: 'no-store',
  });

  if (response.status === 204) {
    return { success: true };
  }

  if (response.status === 404) {
    return { success: false, error: 'Codul introdus este invalid.', code: 'wrong_code' };
  }

  if (response.status === 408) {
    return { success: false, error: 'Codul a expirat. Cere unul nou.', code: 'expired_code' };
  }

  const data = await parseJsonSafely(response);
  const message =
    (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' && data.message) ||
    'Serviciul SMS nu a putut valida codul.';

  return { success: false, error: message, code: 'provider_error' };
}

function hasSmsWapiConfig() {
  return Boolean(
    process.env.SMSWAPI_API_KEY ||
      process.env.SMSWAPI_API_SECRET ||
      process.env.SMSWAPY_API_KEY ||
      process.env.SMSWAPY_API_SECRET,
  );
}

function getSmsWapiApiSecret() {
  const apiSecret =
    process.env.SMSWAPI_API_KEY ||
    process.env.SMSWAPI_API_SECRET ||
    process.env.SMSWAPY_API_KEY ||
    process.env.SMSWAPY_API_SECRET;

  if (!apiSecret) {
    throw new Error('Serviciul SMSWapi OTP nu este configurat.');
  }

  return apiSecret;
}

function getSmsWapiBaseUrl() {
  return (
    process.env.SMSWAPI_BASE_URL ||
    process.env.SMSWAPY_BASE_URL ||
    'https://smswapi.com/api'
  ).replace(/\/$/, '');
}

function getSmsApiBaseUrl() {
  return (process.env.SMSAPI_BASE_URL || 'https://api.smsapi.com').replace(/\/$/, '');
}

function getSmsApiAccessToken() {
  const accessToken = process.env.SMSAPI_ACCESS_TOKEN || process.env.SMSWAPY_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Serviciul SMS OTP nu este configurat.');
  }

  return accessToken;
}

function isSmsWapiSuccess(data: unknown) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const payload = data as { status?: unknown };
  return typeof payload.status === 'number' && payload.status === 200;
}

function getSmsWapiMessage(data: unknown) {
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }

  return null;
}

function getSmsWapiEventId(data: unknown) {
  if (!data || typeof data !== 'object' || !('data' in data) || !data.data || typeof data.data !== 'object') {
    return undefined;
  }

  if ('id' in data.data && typeof data.data.id === 'string') {
    return data.data.id;
  }

  if ('otp' in data.data && typeof data.data.otp === 'string') {
    return data.data.otp;
  }

  return undefined;
}

async function parseJsonSafely(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
