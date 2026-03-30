import { google } from "googleapis";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}/api/auth/google/callback`;

export function createOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(state?: string, includeCalendar = false) {
  const scopes = ["openid", "email", "profile"];
  if (includeCalendar) {
    scopes.push("https://www.googleapis.com/auth/calendar.events");
  }
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
  });
  if (state) params.set("state", state);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function getOAuth2ClientForUser(user: User) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken ?? undefined,
    refresh_token: user.googleRefreshToken ?? undefined,
    expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    if (tokens.access_token) {
      await storage.updateUserGoogleTokens(user.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiryDate: tokens.expiry_date ?? undefined,
      });
    }
  });

  return oauth2Client;
}

export async function createCalendarEvent(user: User, params: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendeeEmail?: string;
}): Promise<string | null> {
  if (!user.googleAccessToken) return null;

  const auth = await getOAuth2ClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });

  const event: any = {
    summary: params.title,
    description: params.description,
    location: params.location,
    start: { dateTime: params.startTime.toISOString() },
    end: { dateTime: params.endTime.toISOString() },
  };

  if (params.attendeeEmail) {
    event.attendees = [{ email: params.attendeeEmail }];
  }

  const result = await calendar.events.insert({
    calendarId: "primary",
    requestBody: event,
    sendUpdates: params.attendeeEmail ? "all" : "none",
  });

  return result.data.id ?? null;
}

export async function deleteCalendarEvent(user: User, eventId: string): Promise<void> {
  if (!user.googleAccessToken) return;
  const auth = await getOAuth2ClientForUser(user);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId: "primary", eventId });
}
