import { GoogleGenAI, Type } from "@google/genai";
import { OBDData, Trip } from "../types";

const getAIInstance = () => {
  const userKey = localStorage.getItem('ztcd_gemini_api_key');
  const apiKey = userKey || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export const processVoiceCommand = async (text: string) => {
  const ai = getAIInstance();
  const model = "gemini-3-flash-preview";

  const tools = [
    {
      functionDeclarations: [
        {
          name: "changeTab",
          description: "Change the current application tab",
          parameters: {
            type: Type.OBJECT,
            properties: {
              tab: {
                type: Type.STRING,
                enum: ["obd", "damage", "gps", "maintenance"],
                description: "The name of the tab to switch to"
              }
            },
            required: ["tab"]
          }
        },
        {
          name: "setNavigation",
          description: "Set the navigation route from and to locations",
          parameters: {
            type: Type.OBJECT,
            properties: {
              from: { type: Type.STRING, description: "Starting location" },
              to: { type: Type.STRING, description: "Destination location" }
            },
            required: ["from", "to"]
          }
        },
        {
          name: "diagnoseVehicle",
          description: "Run an AI diagnostic check on the vehicle's current health",
          parameters: { type: Type.OBJECT, properties: {} }
        },
        {
          name: "controlMusic",
          description: "Control the music player (play, pause, skip, volume)",
          parameters: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                enum: ["play", "pause", "next", "previous", "volume_up", "volume_down"],
                description: "The music control action to perform"
              }
            },
            required: ["action"]
          }
        }
      ]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents: text,
      config: { 
        tools,
        systemInstruction: "You are an AI Co-Pilot for a vehicle telemetry system. You can help the user change tabs, set navigation, diagnose the vehicle, and control the music player. When the user asks to play, pause, skip, or change volume, use the controlMusic tool."
      }
    });

    return {
      text: response.text,
      functionCalls: response.functionCalls
    };
  } catch (error) {
    console.error("Voice command processing failed:", error);
    return { text: "I'm sorry, I couldn't process that command. Please check your connection." };
  }
};

export const runAIDiagnosis = async (data: OBDData) => {
  const ai = getAIInstance();
  const model = "gemini-3-flash-preview";
  const prompt = `You are an expert automotive diagnostics AI. Analyze the following real-time vehicle OBD-II data and provide a comprehensive but plain-language health report. 
  
  Vehicle Telemetry:
  - RPM: ${data.rpm}
  - Speed: ${Math.round(data.speed * 0.621371)} mph
  - Coolant Temp: ${Math.round((data.coolantTemp * 9/5) + 32)} °F
  - Throttle Position: ${data.throttlePos}%
  - Engine Load: ${data.load}%
  - Voltage: ${data.voltage}V
  - Active DTCs: ${data.dtcs.length > 0 ? data.dtcs.join(', ') : 'None'}
  - Readiness Monitors: ${Object.entries(data.readiness).map(([k, v]) => `${k}: ${v ? 'Ready' : 'Not Ready'}`).join(', ')}
  
  Please provide:
  1. A summary of the current vehicle health.
  2. Identification of any anomalies or potential issues based on the telemetry and DTCs.
  3. Specific, actionable recommendations for maintenance or repairs.
  
  Use plain English, avoid overly technical jargon where possible, and format the response clearly using Markdown. Keep the response under 300 words.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("AI Diagnosis failed:", error);
    return "AI Diagnosis is currently unavailable. Please check your API key.";
  }
};

export const fetchDTCDefinition = async (code: string) => {
  const ai = getAIInstance();
  const model = "gemini-3-flash-preview";
  const prompt = `You are an expert automotive diagnostics AI. Provide a concise, plain English explanation of the OBD-II Diagnostic Trouble Code (DTC) ${code}. Include the likely causes and recommended actions. Keep the response under 150 words.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("DTC Definition fetch failed:", error);
    return null; // Return null so we can fallback to local definitions if needed
  }
};

export const getRouteRecommendation = async (trips: Trip[]) => {
  if (trips.length < 2) return { recommendation: "Not enough trip data for recommendations.", alerts: [] };
  
  const ai = getAIInstance();
  const model = "gemini-3-flash-preview";
  const tripSummary = trips.map(t => ({
    damage: t.averageDamageScore,
    distance: t.distance,
    events: t.events.length
  }));

  const prompt = `Based on the following recent driving history, provide a brief route optimization recommendation to reduce vehicle wear and tear.
  Trips: ${JSON.stringify(tripSummary)}
  
  Also, provide 1-3 proactive alerts for upcoming harsh driving conditions or inefficient routes based on this data.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendation: { 
              type: Type.STRING,
              description: "A brief route optimization recommendation in markdown format."
            },
            alerts: {
              type: Type.ARRAY,
              description: "List of proactive alerts for upcoming harsh conditions or inefficient routes.",
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: "Type of alert, e.g., 'harsh_condition', 'inefficient_route'" },
                  message: { type: Type.STRING, description: "The alert message" },
                  severity: { type: Type.STRING, description: "Severity: 'high', 'medium', or 'low'" }
                }
              }
            }
          }
        }
      }
    });
    return JSON.parse(response.text);
  } catch (error) {
    console.error("Route recommendation failed:", error);
    return { recommendation: "Route recommendations are currently unavailable.", alerts: [] };
  }
};
