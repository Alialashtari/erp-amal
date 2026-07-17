/** Channel provider abstraction (Integration Architecture §7; OD-3). */

export interface ProviderResult {
  ok: boolean;
  providerName: string;
  response?: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface SmsMessage {
  to: string;
  text: string;
}

export interface PushProvider {
  send(message: PushMessage): Promise<ProviderResult>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<ProviderResult>;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<ProviderResult>;
}
