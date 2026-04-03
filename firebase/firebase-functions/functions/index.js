const { onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const db = admin.database();
const API_KEY = process.env.API_KEY;

exports.submitReading = onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { node_id, api_key, noise_db, accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z, ultrasonic_cm, battery_pct } = req.body;

  if (!node_id || noise_db === undefined) {
    return res.status(400).json({ error: "node_id and noise_db are required" });
  }

  if (api_key !== API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  const timestamp = Date.now();

  await db.ref(`readings/${node_id}`).push({
    noise_db, accel_x, accel_y, accel_z,
    gyro_x, gyro_y, gyro_z, ultrasonic_cm,
    battery_pct, timestamp,
  });

  await db.ref(`nodes/${node_id}`).update({
    latest_db:  noise_db, ultrasonic_cm,
    battery_pct,
    last_seen:  timestamp,
  });

  return res.status(200).json({ status: "ok" });
});