import { databaseQuery } from "@/lib/db";
import { isPushDeliveryConfigured, pushStatusCode, sendPush, type StoredPushSubscription } from "@/lib/push-delivery";

type ReminderPreferenceRow = {
  user_id: string;
  profile_id: string;
  timezone: string;
  preferences: { notifications?: boolean; notificationTime?: string } | null;
};

type DeliveryRow = { id: string; attempts: number };

function clockInTimeZone(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const value = (name: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === name)?.value;
    const year = value("year");
    const month = value("month");
    const day = value("day");
    const hour = value("hour");
    const minute = value("minute");
    if (!year || !month || !day || !hour || !minute) return null;
    return { date: `${year}-${month}-${day}`, minutes: Number(hour) * 60 + Number(minute) };
  } catch {
    return null;
  }
}

function reminderTime(value: unknown) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return 19 * 60;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function scheduledAt(now: Date, date: string, minutes: number) {
  // The timestamp is informational; timezone-aware due checks above are the source of truth.
  const [hours, minute] = [Math.floor(minutes / 60), minutes % 60];
  const provisional = new Date(`${date}T${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  return Number.isNaN(provisional.getTime()) ? now : provisional;
}

/**
 * Send each opted-in user one daily diary reminder once their chosen local time
 * has passed. This is safe to invoke repeatedly from a five-minute cron job.
 */
export async function dispatchDailyReminders(now = new Date()) {
  if (!isPushDeliveryConfigured()) return { configured: false, due: 0, sent: 0, failed: 0, skipped: 0 };

  const candidates = await databaseQuery<ReminderPreferenceRow>(
    `SELECT pref.user_id, p.id AS profile_id, p.timezone, pref.preferences
     FROM food_catalog.app.user_preferences pref
     JOIN food_catalog.app.profiles p ON p.id = pref.current_profile_id
     WHERE COALESCE(pref.preferences->>'notifications', 'true') = 'true'`,
  );
  let due = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const candidate of candidates.rows) {
    const clock = clockInTimeZone(now, candidate.timezone);
    if (!clock || clock.minutes < reminderTime(candidate.preferences?.notificationTime)) {
      skipped += 1;
      continue;
    }
    due += 1;
    const subscriptions = await databaseQuery<StoredPushSubscription>(
      `SELECT endpoint, p256dh, auth FROM food_catalog.app.push_subscriptions
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [candidate.user_id],
    );
    if (!subscriptions.rowCount) {
      skipped += 1;
      continue;
    }

    const title = "Time to check in";
    const body = "Log today’s meals and water to keep your nutrition plan on track.";
    const delivery = await databaseQuery<DeliveryRow>(
      `INSERT INTO food_catalog.app.reminder_deliveries
         (user_id, profile_id, kind, local_date, scheduled_for, title, body, attempts)
       VALUES ($1, $2, 'daily_tracking', $3::date, $4, $5, $6, 1)
       ON CONFLICT (user_id, kind, local_date) DO UPDATE
         SET attempts = food_catalog.app.reminder_deliveries.attempts + 1, status = 'pending', last_error = NULL
         WHERE food_catalog.app.reminder_deliveries.status = 'failed' AND food_catalog.app.reminder_deliveries.attempts < 3
       RETURNING id, attempts`,
      [candidate.user_id, candidate.profile_id, clock.date, scheduledAt(now, clock.date, reminderTime(candidate.preferences?.notificationTime)), title, body],
    );
    const record = delivery.rows[0];
    if (!record) {
      skipped += 1;
      continue;
    }

    let deliveryCount = 0;
    const errors: string[] = [];
    for (const subscription of subscriptions.rows) {
      try {
        await sendPush(subscription, { title, body, url: "/?page=diary" });
        deliveryCount += 1;
      } catch (error) {
        const status = pushStatusCode(error);
        if (status === 404 || status === 410) {
          await databaseQuery("UPDATE food_catalog.app.push_subscriptions SET revoked_at = now() WHERE endpoint = $1", [subscription.endpoint]);
        }
        errors.push(error instanceof Error ? error.message : "Push delivery failed.");
      }
    }
    if (deliveryCount) {
      await databaseQuery(
        `UPDATE food_catalog.app.reminder_deliveries
         SET status = 'sent', delivery_count = $2, sent_at = now(), last_error = NULL WHERE id = $1`,
        [record.id, deliveryCount],
      );
      sent += 1;
    } else {
      await databaseQuery(
        `UPDATE food_catalog.app.reminder_deliveries
         SET status = 'failed', failed_at = now(), last_error = $2 WHERE id = $1`,
        [record.id, errors.join(" ").slice(0, 500) || "No active push subscriptions."],
      );
      failed += 1;
    }
  }
  return { configured: true, due, sent, failed, skipped };
}
