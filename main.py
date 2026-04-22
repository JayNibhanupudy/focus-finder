
import time
import numpy as np
import firebase_admin
from firebase_admin import db
from sklearn.ensemble import IsolationForest

# Config
DATABASE_URL = "https://focus-finder-ab981-default-rtdb.firebaseio.com"
MIN_TRAINING_SAMPLES = 20
ACCEL_THRESHOLD = 2.0
GYRO_THRESHOLD = 5.0
CONTAMINATION = 0.05

# Init Firebase
firebase_admin.initialize_app(options={"databaseURL": DATABASE_URL})


def extract_features(reading: dict) -> list:
    return [
        float(reading["accel_x"]),
        float(reading["accel_y"]),
        float(reading["accel_z"]),
        float(reading["gyro_x"]),
        float(reading["gyro_y"]),
        float(reading["gyro_z"]),
    ]


def threshold_fallback(features: list) -> bool:
    accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z = features
    accel_deviation = abs(accel_x) + abs(accel_y) + abs(accel_z - 9.8)
    gyro_magnitude = abs(gyro_x) + abs(gyro_y) + abs(gyro_z)
    return accel_deviation > ACCEL_THRESHOLD or gyro_magnitude > GYRO_THRESHOLD


def analyze_reading(node_id, reading):
    try:
        new_features = extract_features(reading)
    except (KeyError, TypeError) as e:
        print(f"  Could not extract features: {e}")
        return

    # Load last 200 readings for training
    readings_ref = db.reference(f"/validated_data/{node_id}")
    snapshot = readings_ref.order_by_key().limit_to_last(200).get()

    if not snapshot:
        print(f"  No historical data, using threshold fallback")
        is_tamper = threshold_fallback(new_features)
    else:
        training_data = []
        for key, r in snapshot.items():
            try:
                training_data.append(extract_features(r))
            except (KeyError, TypeError):
                continue

        if len(training_data) < MIN_TRAINING_SAMPLES:
            print(f"  Only {len(training_data)} samples, using threshold fallback")
            is_tamper = threshold_fallback(new_features)
        else:
            print(f"  Training Isolation Forest on {len(training_data)} samples...")
            X_train = np.array(training_data)
            model = IsolationForest(
                n_estimators=100,
                contamination=CONTAMINATION,
                random_state=42,
                max_samples="auto",
            )
            model.fit(X_train)

            new_point = np.array(new_features).reshape(1, -1)
            prediction = model.predict(new_point)[0]
            score = model.decision_function(new_point)[0]
            is_tamper = prediction == -1
            print(f"  ML Result: prediction={prediction}, score={score:.4f}, tamper={is_tamper}")

    # Write result back
    db.reference(f"/nodes/{node_id}").update({
        "tamper_detected": bool(is_tamper),
        "last_analysis": {".sv": "timestamp"},
    })
    print(f"  -> {'TAMPER DETECTED' if is_tamper else 'Normal'}")


def main():
    print("Focus Finder ML - listening for readings...\n")

    # Track what we've already processed
    seen_keys = {}

    # Load existing keys so we don't reprocess old data
    all_readings = db.reference("/validated_data").get() or {}
    for node_id, readings in all_readings.items():
        if isinstance(readings, dict):
            seen_keys[node_id] = set(readings.keys())

    print(f"Loaded {sum(len(v) for v in seen_keys.values())} existing readings across {len(seen_keys)} nodes")
    print("Polling for new readings every 5 seconds...\n")

    while True:
        all_readings = db.reference("/validated_data").get() or {}

        for node_id, readings in all_readings.items():
            if not isinstance(readings, dict):
                continue

            if node_id not in seen_keys:
                seen_keys[node_id] = set()

            for key, reading in readings.items():
                if key not in seen_keys[node_id]:
                    seen_keys[node_id].add(key)
                    print(f"[{node_id}] New reading {key}: noise_db={reading.get('noise_db')}")
                    analyze_reading(node_id, reading)
                    print()

        time.sleep(5)


if __name__ == "__main__":
    main()
