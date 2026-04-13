import JSON5 from "json5";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type IncomingImage = {
  mimeType?: string;
  type?: string;
  data?: string;
};

type CondoComponent = {
  name: string;
  category: string;
  estimatedValue: number;
  quantity: number;
  notes: string;
  valuationRationale: string;
};

function normalizeImagePayload(image: IncomingImage | string) {
  let mimeType = "image/jpeg";
  let data = "";

  if (typeof image === "string") {
    data = image;
  } else {
    mimeType = image.mimeType || image.type || mimeType;
    data = image.data || "";
  }

  if (data.startsWith("data:")) {
    const match = data.match(/^data:(.+);base64,(.+)$/);
    if (match && match.length === 3) {
      mimeType = match[1];
      data = match[2];
    }
  }

  return { mimeType, data };
}

function sanitizeComponents(components: unknown): CondoComponent[] {
  if (!Array.isArray(components)) {
    return [];
  }

  return components.map((component) => {
    const record = typeof component === "object" && component ? (component as Record<string, unknown>) : {};
    return {
      name: typeof record.name === "string" && record.name.trim() ? record.name : "Unnamed component",
      category: typeof record.category === "string" && record.category.trim() ? record.category : "interior finish",
      estimatedValue: typeof record.estimatedValue === "number" && Number.isFinite(record.estimatedValue)
        ? Math.max(0, Math.round(record.estimatedValue))
        : 0,
      quantity: typeof record.quantity === "number" && Number.isFinite(record.quantity) && record.quantity > 0
        ? Math.round(record.quantity)
        : 1,
      notes: typeof record.notes === "string" ? record.notes : "",
      valuationRationale: typeof record.valuationRationale === "string" && record.valuationRationale.trim()
        ? record.valuationRationale
        : "AI-generated replacement-cost estimate.",
    };
  });
}

function extractJsonBlock(rawText: string) {
  const trimmed = rawText.trim();
  const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return blockMatch ? blockMatch[1] : trimmed;
}

function parseModelJson(rawText: string) {
  const candidate = extractJsonBlock(rawText);
  try {
    return JSON.parse(candidate);
  } catch {
    return JSON5.parse(candidate);
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders });
}

export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const { images, roomName } = await request.json();

    if (!Array.isArray(images) || images.length === 0) {
      return new Response(JSON.stringify({ error: "At least one room image is required." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not set for this project." }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const model = env.OPENAI_MODEL || "gpt-4.1-mini";
    const imageParts = images
      .map(normalizeImagePayload)
      .filter((image) => image.data)
      .map((image) => ({
        type: "image_url",
        image_url: {
          url: `data:${image.mimeType};base64,${image.data}`,
          detail: "high",
        },
      }));

    if (imageParts.length === 0) {
      return new Response(JSON.stringify({ error: "No readable image data was provided." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const prompt = `You are a senior condo interior rebuild estimator for an insurance agency.

MISSION:
Analyze the provided image(s) of the "${roomName || "condo room"}" in a condo unit and estimate only the permanently installed interior property that a unit owner may need to insure under an HO-6 or condo unit-owners policy.

INCLUDE:
- Cabinets, vanities, countertops, sinks, faucets
- Shower and tub surrounds, tile, flooring
- Trim, paint package, interior doors, mirrors attached to walls
- Lighting fixtures, ceiling fans, built-in shelving, closet systems
- Owner-supplied appliances visible in the room
- Other attached upgrades or built-ins that would need to be rebuilt after a covered loss

EXCLUDE:
- Furniture, rugs, decor, TVs, electronics, clothing, dishes, food, toiletries, artwork, and other movable contents
- Exterior or common-area elements handled by the association

RULES:
1. Be conservative if the quality level is unclear.
2. Use Google Search to validate replacement-cost ranges when a material or fixture tier is visible enough to identify.
3. Focus on replacement cost, not actual cash value.
4. Group similar attached items together when helpful.
5. Return only fixtures and permanently attached features that belong in condo interior coverage.

OUTPUT:
Return ONLY a strict RFC 8259 JSON object using this schema. Every property name must use double quotes:
{
  "roomSummary": "string",
  "components": [
    {
      "name": "string",
      "category": "string",
      "estimatedValue": number,
      "quantity": number,
      "notes": "string",
      "valuationRationale": "string"
    }
  ]
}`;

    const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        max_tokens: 1800,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...imageParts,
            ],
          },
        ],
      }),
    });

    if (!openAiResponse.ok) {
      const detail = await openAiResponse.text();
      throw new Error(`OpenAI request failed: ${detail}`);
    }

    const responsePayload = await openAiResponse.json();
    const rawText = responsePayload?.choices?.[0]?.message?.content || "";
    const payload = parseModelJson(rawText);
    const roomSummary = typeof payload.roomSummary === "string" ? payload.roomSummary : "";
    const components = sanitizeComponents(payload.components);

    return new Response(JSON.stringify({ roomSummary, components }), { headers: corsHeaders });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: "Room estimate failed",
        detail: error?.message || String(error),
      }),
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
