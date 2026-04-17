#include "HX711.h"

// Hardware Pins
const int LOADCELL_DOUT_PIN = 4;
const int LOADCELL_SCK_PIN = 5;
const int FLOW_SENSOR_PIN = 2; // Interrupt pin 0 on UNO

HX711 scale;
volatile int pulseCount = 0;
unsigned long oldTime = 0;

int patientId = 1;
float maxFluidVolume_mL = 500.0;

void pulseCounter() {
  pulseCount++;
}

void setup() {
  // Communicate with ESP8266 at 9600 baud
  Serial.begin(9600);
  
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);
  
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  // scale.set_scale(YOUR_CALIBRATION_FACTOR);
  scale.tare();
}

void loop() {
  unsigned long currentTime = millis();
  
  // Calculate and send data every 2 seconds
  if ((currentTime - oldTime) > 2000) {
    detachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN));
    
    // 1. Flow Rate Calculation (assuming drips / conversion)
    float flowRate_mL_hr = pulseCount * 60.0; 
    
    // 2. Load Cell Reading
    float weight = scale.get_units(5);
    if (weight < 0) weight = 0;
    
    int fluidLevelPercent = (int)((weight / maxFluidVolume_mL) * 100);
    if(fluidLevelPercent > 100) fluidLevelPercent = 100;
    
    // 3. Time Remaining
    int timeRemaining_mins = 0;
    if (flowRate_mL_hr > 0) {
        timeRemaining_mins = (int)((weight / (flowRate_mL_hr / 60.0)));
    }

    // 4. Create and print JSON over Serial to ESP8266
    Serial.print("{\"patientId\":");
    Serial.print(patientId);
    Serial.print(",\"fluidLevel\":");
    Serial.print(fluidLevelPercent);
    Serial.print(",\"flowRate\":");
    Serial.print(flowRate_mL_hr, 1);
    Serial.print(",\"timeRemaining\":");
    Serial.print(timeRemaining_mins);
    Serial.println("}");

    // Reset counters
    pulseCount = 0;
    oldTime = currentTime;
    attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), pulseCounter, FALLING);
  }
}
