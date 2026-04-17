#include <ESP8266WiFi.h>
#include <WebSocketsServer.h>

// --- Wi-Fi Settings ---
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Start a WebSocket server on port 81
WebSocketsServer webSocket = WebSocketsServer(81);

// Variables for incoming serial data from Arduino UNO
String serialBuffer = "";

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break;
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
      // Optional: send an initial greeting or state
      webSocket.sendTXT(num, "{\"status\": \"Connected to ESP8266 WebSocket Server\"}");
      break;
    }
    case WStype_TEXT:
      // We don't necessarily expect text from the dashboard, but handle if needed
      Serial.printf("[%u] Received Text: %s\n", num, payload);
      break;
  }
}

void setup() {
  // Serial communication with Arduino UNO (must match Arduino's baud rate)
  Serial.begin(9600);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
  
  // Start WebSocket Server
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
}

void loop() {
  webSocket.loop();
  
  // Read JSON stream coming from the Arduino UNO via RX/TX Serial pins
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      // Complete line received from Arduino
      serialBuffer.trim();
      
      if(serialBuffer.length() > 0 && serialBuffer.startsWith("{")) {
        // We received a valid JSON line from the Arduino
        // Broadcast it instantly to all connected Web App dashboards
        webSocket.broadcastTXT(serialBuffer);
      }
      
      serialBuffer = ""; // Reset buffer
    } else {
      serialBuffer += c;
    }
  }
}
