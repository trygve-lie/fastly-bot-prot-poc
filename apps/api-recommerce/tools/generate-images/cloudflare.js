// Minimal Workers AI REST client for FLUX.2 text-to-image models (multipart form input).
// https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/**
 * Creates a client bound to one account, token and model.
 * @param {{ accountId: string, apiToken: string, model: string, maxRetries?: number }} options
 * @returns {{ generate: (params: { prompt: string, width: number, height: number, seed: number }) => Promise<Buffer> }}
 */
export function createCloudflareClient({ accountId, apiToken, model, maxRetries = 5 }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  async function generate({ prompt, width, height, seed }) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await sleep(Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 500);
      try {
        const form = new FormData();
        form.append('prompt', prompt);
        form.append('width', String(width));
        form.append('height', String(height));
        form.append('seed', String(seed));

        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}` },
          body: form,
        });
        const text = await res.text();
        let body;
        try { body = JSON.parse(text); } catch { body = null; }

        if (!res.ok || !body?.success || !body?.result?.image) {
          const detail = body?.errors?.map(e => `${e.code}: ${e.message}`).join('; ') || text.slice(0, 300);
          const error = new Error(`Cloudflare ${res.status}: ${detail}`);
          error.status = res.status;
          error.code = body?.errors?.[0]?.code; // e.g. 3030 = generated image flagged by the safety filter
          if (!RETRYABLE_STATUS.has(res.status)) throw Object.assign(error, { fatal: true });
          lastError = error;
          continue;
        }
        return Buffer.from(body.result.image, 'base64');
      } catch (err) {
        if (err.fatal) throw err;
        lastError = err;
      }
    }
    throw lastError;
  }

  return { generate };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
