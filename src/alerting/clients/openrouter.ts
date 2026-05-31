import type { AlertingEnv, Anomaly } from "../types";

interface OpenRouterModelsResponse {
  data: Array<{
    id: string;
    name: string;
    pricing?: {
      prompt: string;
      completion: string;
    };
  }>;
}

export async function checkOpenRouterModelAvailability(
  env: AlertingEnv
): Promise<Anomaly[]> {
  const modelId = env.OPENROUTER_MODEL_ID;
  const now = new Date();

  let models: OpenRouterModelsResponse;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      method: "GET",
      headers: {
        "HTTP-Referer": "https://seppe.dev",
        "X-Title": "personal-website-alerting"
      }
    });

    if (!response.ok) {
      throw new Error(
        `OpenRouter models API returned ${response.status} ${response.statusText}`
      );
    }

    models = (await response.json()) as OpenRouterModelsResponse;
  } catch (err) {
    console.error("[OpenRouter] Failed to fetch models list:", err);
    return [
      {
        type: "openrouter_model_unavailable",
        severity: "high",
        message: `Could not reach OpenRouter models API to verify model "${modelId}": ${err instanceof Error ? err.message : String(err)}`,
        value: 0,
        threshold: 1,
        timestamp: now
      }
    ];
  }

  const found = models.data.some((m) => m.id === modelId);

  if (!found) {
    return [
      {
        type: "openrouter_model_unavailable",
        severity: "high",
        message: `OpenRouter model "${modelId}" is no longer available (not found in the models list). It may have been removed or is no longer free.`,
        value: 0,
        threshold: 1,
        timestamp: now
      }
    ];
  }

  console.log(`[OpenRouter] Model "${modelId}" is available`);
  return [];
}
