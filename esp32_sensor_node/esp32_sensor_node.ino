#include <WiFi.h>
#include <PubSubClient.h>
#include "HX711.h"

// --- Wi-Fi & MQTT Settings ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* mqtt_server = "192.168.1.100"; // IP address of your Raspberry Pi / PC running Mosquitto
const int mqtt_port = 1883;

// --- Sensor Settings ---
// HX711 circuit wiring for Weight Sensor (Load Cell)
const int LOADCELL_DOUT_PIN = 16;
const int LOADCELL_SCK_PIN = 4;
HX711 scale;

// YF-S201 Flow Sensor
const int FLOW_SENSOR_PIN = 2;
volatile int pulseCount = 0;
float flowRate = 0.0;
unsigned long oldTime = 0;

// Variables
int patientId = 1;
float currentFluidVolume_mL = 500.0; // Assuming a 500mL standard IV bag
float maxFluidVolume_mL = 500.0;

WiFiClient espClient;
PubSubClient client(espClient);

// Flow sensor interrupt routine
void IRAM_ATTR pulseCounter() {
  pulseCount++;
}

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected");
  Serial.println("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    String clientId = "ESP32Client-Patient" + String(patientId);
    
    if (client.connect(clientId.c_str())) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);

  // Setup Wi-Fi & MQTT
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);

  // Setup Flow Sensor
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);

  // Setup Load Cell
  Serial.println("Initializing the scale");
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  
  // NOTE: You MUST calibrate this scale variable factor for your specific load cell!
  // scale.set_scale(2280.f); 
  scale.tare(); // Reset the scale to 0
  Serial.println("Hardware Initialized...");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  unsigned long currentTime = millis();
  
  // Update data every 2 seconds
  if ((currentTime - oldTime) > 2000) {
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    
    // 1. Calculate Flow Rate
    // The YF-S201 sensor gives roughly 7.5 pulses per second per Litre/min
    // flowRate = (pulseCount / 7.5); // L/min
    // However for IV drips we usually want mL/hr. 
    // This requires calibration depending on if using drip counter vs hall effect.
    float dripRate_mL_hr = pulseCount * 60.0; // simple mock calculation based on pulses
    
    // 2. Read Load Cell for remaining fluid
    // If the load cell isn't connected, this will block or return random data.
    float weight = scale.get_units(5); // Average of 5 readings
    
    // Prevent negative weights
    if (weight < 0) weight = 0;
    
    // Convert weight (assuming 1g approx = 1mL for water solutions) to percentage
    int fluidLevelPercent = (int)((weight / maxFluidVolume_mL) * 100);
    if(fluidLevelPercent > 100) fluidLevelPercent = 100;
    
    // 3. Calculate Time Remaining
    // timeRemaining = remaining volume (mL) / flow rate (mL/min)
    int timeRemaining_mins = 0;
    if (dripRate_mL_hr > 0) {
        timeRemaining_mins = (int)((weight / (dripRate_mL_hr / 60.0)));
    }

    // 4. Create JSON string
    String payload = "{";
    payload += "\"patientId\":" + String(patientId) + ",";
    payload += "\"fluidLevel\":" + String(fluidLevelPercent) + ",";
    payload += "\"flowRate\":" + String(dripRate_mL_hr, 1) + ",";
    payload += "\"timeRemaining\":" + String(timeRemaining_mins);
    payload += "}";

    // 5. Publish to MQTT
    // Topic: hospital/ward1/bed1/fluid
    String topic = "hospital/ward1/bed" + String(patientId) + "/fluid";
    Serial.print("Publishing to ");
    Serial.print(topic);
    Serial.print(" >> ");
    Serial.println(payload);
    
    client.publish(topic.c_str(), payload.c_str());

    // Reset flow sensor variables for next 2 second window
    pulseCount = 0;
    oldTime = currentTime;
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);
  }
}
