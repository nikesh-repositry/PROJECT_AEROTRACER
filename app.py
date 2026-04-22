from flask import Flask, request, jsonify, make_response
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.multioutput import MultiOutputRegressor

app = Flask(__name__)

print("[SYSTEM] Initializing Aero-Rescue SAR Model...")

# ==========================================
# 1. HELPER FUNCTION
# ==========================================
def engineer_features(df):
    df = df.copy()
    safe_vert_speed = df['vertical_speed_fpm'].apply(lambda x: -1 if x >= 0 else x)
    df['calc_time_to_impact_min'] = df['altitude_ft'] / abs(safe_vert_speed)
    df['calc_distance_nm'] = (df['speed_knots'] / 60) * df['calc_time_to_impact_min']
    return df

# ==========================================
# 2. DATA PREPARATION & TRAINING
# ==========================================
np.random.seed(42)
num_samples = 5000 

X_raw = pd.DataFrame({
    'last_lat': np.random.uniform(-90, 90, num_samples),
    'last_lon': np.random.uniform(-180, 180, num_samples),
    'altitude_ft': np.random.uniform(10000, 40000, num_samples),
    'speed_knots': np.random.uniform(200, 600, num_samples),
    'heading_deg': np.random.uniform(0, 360, num_samples),
    'vertical_speed_fpm': np.random.uniform(-8000, -500, num_samples) 
})

X = engineer_features(X_raw)
time_to_impact_min = X_raw['altitude_ft'] / abs(X_raw['vertical_speed_fpm'])
theoretical_dist = (X_raw['speed_knots'] / 60) * time_to_impact_min
realistic_crash_dist = theoretical_dist * np.random.uniform(0.05, 0.15, num_samples)

lat_change = (realistic_crash_dist / 60) * np.cos(np.radians(X_raw['heading_deg']))
lon_change = (realistic_crash_dist / 60) * np.sin(np.radians(X_raw['heading_deg']))

y = pd.DataFrame({
    'delta_lat': lat_change + np.random.normal(0, 0.002, num_samples),
    'delta_lon': lon_change + np.random.normal(0, 0.002, num_samples)
})

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

base_xgb = xgb.XGBRegressor(
    objective='reg:squarederror',
    n_estimators=500,          
    learning_rate=0.03,        
    max_depth=6,               
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42
)

model = MultiOutputRegressor(base_xgb)
model.fit(X_train, y_train)
print("[SYSTEM] Neural Net Trained. Server Ready.")

# ==========================================
# 3. API ENDPOINT (EXPLICIT CORS & ERROR CATCHING)
# ==========================================
@app.route('/predict', methods=['POST', 'OPTIONS'])
def predict():
    # 1. Catch the Preflight OPTIONS request explicitly
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "*")
        response.headers.add("Access-Control-Allow-Methods", "*")
        return response

    # 2. Process POST Request safely
    try:
        data = request.get_json(force=True) # Forces parsing
        
        input_df = pd.DataFrame([{
            'last_lat': float(data['last_lat']),
            'last_lon': float(data['last_lon']),
            'altitude_ft': float(data['altitude_ft']),
            'speed_knots': float(data['speed_knots']),
            'heading_deg': float(data['heading_deg']),
            'vertical_speed_fpm': float(data['vertical_speed_fpm'])
        }])
        
        input_features = engineer_features(input_df)
        predicted_deltas = model.predict(input_features)[0]
        
        final_lat = float(data['last_lat']) + predicted_deltas[0]
        final_lon = float(data['last_lon']) + predicted_deltas[1]
        
        # 3. Send successful data back with headers attached
        response = jsonify({
            'status': 'success',
            'predicted_lat': float(final_lat),   # <--- THE FIX
            'predicted_lon': float(final_lon)    # <--- THE FIX
        })
        response.headers.add("Access-Control-Allow-Origin", "*")
        return response
        
    except Exception as e:
        # If the math fails, don't crash. Send the error to the browser.
        print(f"[SYSTEM ERROR] {str(e)}")
        err_response = jsonify({'status': 'error', 'message': str(e)})
        err_response.headers.add("Access-Control-Allow-Origin", "*")
        return err_response, 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
