// Daily reminder checker — mirrors the original Apps Script logic.
// Runs once a day (8:05 am Asia/Dhaka) via GitHub Actions.

import admin from "firebase-admin";
import nodemailer from "nodemailer";

// ---- Firebase init (service account JSON comes from a GitHub secret) ----
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const messaging = admin.messaging();

// ---- Email transport (Gmail SMTP, using an App Password) ----
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

function todayInDhaka() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  now.setHours(0, 0, 0, 0);
  return now;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function formatDate(d) {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function emailBody(taskName, dueDate, priority, when) {
  const color = priority === "High" ? "#a33f2d" : priority === "Medium" ? "#b5762a" : "#2f5c60";
  return `
    <div style="background:#f6f4ee;padding:30px;font-family:Arial,sans-serif;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #dcd8cb;padding:30px;">
        <h2 style="color:#1c2321;border-bottom:2px solid #efece3;padding-bottom:15px;">Task notification</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
          <tr><td style="padding:10px 0;color:#726d5f;font-weight:bold;">Task name:</td><td style="padding:10px 0;">${taskName}</td></tr>
          <tr><td style="padding:10px 0;color:#726d5f;font-weight:bold;">Due date:</td><td style="padding:10px 0;">${formatDate(dueDate)} (${when})</td></tr>
          <tr><td style="padding:10px 0;color:#726d5f;font-weight:bold;">Priority:</td><td style="padding:10px 0;"><span style="background:${color};color:#fff;padding:2px 10px;border-radius:4px;">${priority}</span></td></tr>
        </table>
        <p style="margin-top:25px;color:#555;">Please complete the task on time.</p>
      </div>
    </div>`;
}

async function sendEmail(recipients, subject, html) {
  // recipients can be an array (per-task) or a comma-separated string (default fallback)
  const addresses = Array.isArray(recipients)
    ? recipients
    : (recipients || "").split(",").map(a => a.trim()).filter(Boolean);
  for (const to of addresses) {
    if (!to) continue;
    await transporter.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
  }
}

function resolveRecipients(task, defaultEmail) {
  if (task.notifyEmails && task.notifyEmails.length) return task.notifyEmails;
  return defaultEmail;
}

async function sendPush(token, title, body) {
  if (!token) return;
  try {
    await messaging.send({ token, notification: { title, body } });
  } catch (e) {
    console.error("Push failed:", e.message);
  }
}

function nextDueDate(oldDate, repeat) {
  const d = new Date(oldDate);
  if (repeat === "Daily") d.setDate(d.getDate() + 1);
  else if (repeat === "Weekly") d.setDate(d.getDate() + 7);
  else if (repeat === "Monthly") d.setMonth(d.getMonth() + 1);
  else if (repeat === "Yearly") d.setFullYear(d.getFullYear() + 1);
  else return null;
  return d;
}

async function generateTaskId(category, dueDate) {
  const cat = category === "Birthday / Anniversary" ? "Bday" : category;
  const year = dueDate.getFullYear();
  const month = dueDate.toLocaleString("en-US", { month: "short" });
  const prefix = `${cat}-${year}-${month}-`;
  const snap = await db.collection("tasks").get();
  const count = snap.docs.filter(d => (d.data().taskId || "").startsWith(prefix)).length;
  return prefix + String(count + 1).padStart(2, "0");
}

async function main() {
  const settingsSnap = await db.collection("settings").doc("user").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const notifyEmail = settings.notifyEmail;
  const pushEnabled = !!settings.pushEnabled;
  const fcmToken = settings.fcmToken;

  const today = todayInDhaka();
  const tomorrow = addDays(today, 1);

  const tasksSnap = await db.collection("tasks").get();

  for (const docSnap of tasksSnap.docs) {
    const task = docSnap.data();
    const ref = docSnap.ref;

    if (!task.name || task.status === "Completed" || task.status === "Cancelled") continue;
    if (!task.dueDate) continue;

    const due = new Date(task.dueDate);
    due.setHours(0, 0, 0, 0);

    // Reminder 1: due tomorrow
    if (!task.reminder1Sent && sameDay(due, tomorrow)) {
      await sendEmail(resolveRecipients(task, notifyEmail), `Reminder: task due tomorrow - ${task.name}`,
        emailBody(task.name, due, task.priority, "Tomorrow"));
      if (pushEnabled) await sendPush(fcmToken, "Task due tomorrow", task.name);
      await ref.update({ reminder1Sent: true });
      console.log("R1 sent:", task.name);
    }

    // Reminder 2: due today
    if (!task.reminder2Sent && sameDay(due, today)) {
      await sendEmail(resolveRecipients(task, notifyEmail), `Task due today - ${task.name}`,
        emailBody(task.name, due, task.priority, "Today"));
      if (pushEnabled) await sendPush(fcmToken, "Task due today", task.name);
      await ref.update({ reminder2Sent: true, lastRun: new Date().toISOString() });
      console.log("R2 sent:", task.name);

      const repeat = task.repeatType;
      if (repeat && repeat !== "None") {
        const nextDate = nextDueDate(due, repeat);
        const newTaskId = await generateTaskId(task.category, nextDate);
        await db.collection("tasks").add({
          taskId: newTaskId,
          name: task.name,
          category: task.category,
          priority: task.priority,
          dueDate: nextDate.toISOString().slice(0, 10),
          repeatType: repeat,
          status: "Pending",
          notifyEmails: task.notifyEmails || [],
          reminder1Sent: false,
          reminder2Sent: false,
          createdAt: new Date().toISOString(),
        });
        console.log("Recurring task created:", newTaskId);
      }
    }
  }
}

main().then(() => {
  console.log("Reminder check complete.");
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
