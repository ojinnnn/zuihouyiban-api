import { Request, RequestHandler, Router } from "express";
import { config } from "../config";
import { AzureOpenAIKey, keyPool, OpenAIKey } from "../shared/key-management";
import { getOpenAIModelFamily } from "../shared/models";
import { ipLimiter } from "./rate-limit";
import {
  addKey,
  addKeyForEmbeddingsRequest,
  createEmbeddingsPreprocessorMiddleware,
  createPreprocessorMiddleware,
  finalizeBody,
  RequestPreprocessor,
} from "./middleware/request";
import { ProxyResHandlerWithBody } from "./middleware/response";
import { createQueuedProxyMiddleware } from "./middleware/request/proxy-middleware-factory";

// https://platform.openai.com/docs/models/overview
let modelsCache: any = null;
let modelsCacheTime = 0;

export function generateModelList(service: "openai" | "azure") {
  const keys = keyPool
    .list()
    .filter((k) => k.service === service && !k.isDisabled) as
    | OpenAIKey[]
    | AzureOpenAIKey[];
  if (keys.length === 0) return [];

  const allowedModelFamilies = new Set(config.allowedModelFamilies);
  const modelFamilies = new Set(
    keys
      .flatMap((k) => k.modelFamilies)
      .filter((f) => allowedModelFamilies.has(f))
  );

  const modelIds = new Set(
    keys
      .flatMap((k) => k.modelIds)
      .filter((id) => {
        const allowed = modelFamilies.has(getOpenAIModelFamily(id));
        const known = ["gpt", "o1", "dall-e", "chatgpt", "text-embedding"].some(
          (prefix) => id.startsWith(prefix)
        );
        const isFinetune = id.includes("ft");
        return allowed && known && !isFinetune;
      })
  );

  return Array.from(modelIds).map((id) => ({
    id,
    object: "model",
    created: new Date().getTime(),
    owned_by: service,
    permission: [
      {
        id: "modelperm-" + id,
        object: "model_permission",
        created: new Date().getTime(),
        organization: "*",
        group: null,
        is_blocking: false,
      },
    ],
    root: id,
    parent: null,
  }));
}

const handleModelRequest: RequestHandler = async (req, res) => {
  if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
    return res.status(200).json(modelsCache);
  }

  try {
    // 从您的OpenAI兼容端点获取模型列表
    const http = require('http');
    const key = config.openaiKey?.split(",")[0];
    
    const response = await new Promise((resolve, reject) => {
      const options = {
        hostname: '107.174.221.205',
        port: 3000,
        path: '/v1/models',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${key}`
        }
      };
      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            if (data) {
              resolve(JSON.parse(data));
            } else {
              resolve({ object: "list", data: [] });
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.end();
    });
    
    modelsCache = response;
    modelsCacheTime = new Date().getTime();
    res.status(200).json(modelsCache);
  } catch (error) {
    req.log?.error({ error }, "Failed to fetch models from upstream");
    // 如果获取失败，返回空列表
    const fallback = { object: "list", data: [] };
    res.status(200).json(fallback);
  }
};

/** Handles some turbo-instruct special cases. */
const rewriteForTurboInstruct: RequestPreprocessor = (req) => {
  // /v1/turbo-instruct/v1/chat/completions accepts either prompt or messages.
  // Depending on whichever is provided, we need to set the inbound format so
  // it is transformed correctly later.
  if (req.body.prompt && !req.body.messages) {
    req.inboundApi = "openai-text";
  } else if (req.body.messages && !req.body.prompt) {
    req.inboundApi = "openai";
    // Set model for user since they're using a client which is not aware of
    // turbo-instruct.
    req.body.model = "gpt-3.5-turbo-instruct";
  } else {
    throw new Error("`prompt` OR `messages` must be provided");
  }

  req.url = "/v1/completions";
};

const openaiResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }

  let newBody = body;
  if (req.outboundApi === "openai-text" && req.inboundApi === "openai") {
    req.log.info("Transforming Turbo-Instruct response to Chat format");
    newBody = transformTurboInstructResponse(body);
  }

  res.status(200).json({ ...newBody, proxy: body.proxy });
};

function transformTurboInstructResponse(
  turboInstructBody: Record<string, any>
): Record<string, any> {
  const transformed = { ...turboInstructBody };
  transformed.choices = [
    {
      ...turboInstructBody.choices[0],
      message: {
        role: "assistant",
        content: turboInstructBody.choices[0].text.trim(),
      },
    },
  ];
  delete transformed.choices[0].text;
  return transformed;
}

const openaiProxy = createQueuedProxyMiddleware({
  mutations: [addKey, finalizeBody],
  target: "http://107.174.221.205:3000",
  blockingResponseHandler: openaiResponseHandler,
});

const openaiEmbeddingsProxy = createQueuedProxyMiddleware({
  mutations: [addKeyForEmbeddingsRequest, finalizeBody],
  target: "http://107.174.221.205:3000",
});

const openaiRouter = Router();
openaiRouter.get("/v1/models", handleModelRequest);
// Native text completion endpoint, only for turbo-instruct.
openaiRouter.post(
  "/v1/completions",
  ipLimiter,
  createPreprocessorMiddleware({
    inApi: "openai-text",
    outApi: "openai-text",
    service: "openai",
  }),
  openaiProxy
);
// turbo-instruct compatibility endpoint, accepts either prompt or messages
openaiRouter.post(
  /\/v1\/turbo-instruct\/(v1\/)?chat\/completions/,
  ipLimiter,
  createPreprocessorMiddleware(
    { inApi: "openai", outApi: "openai-text", service: "openai" },
    {
      beforeTransform: [rewriteForTurboInstruct],
      afterTransform: [forceModel("gpt-3.5-turbo-instruct")],
    }
  ),
  openaiProxy
);
// General chat completion endpoint. Turbo-instruct is not supported here.
openaiRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  createPreprocessorMiddleware(
    { inApi: "openai", outApi: "openai", service: "openai" },
    { afterTransform: [fixupMaxTokens] }
  ),
  openaiProxy
);
// Embeddings endpoint.
openaiRouter.post(
  "/v1/embeddings",
  ipLimiter,
  createEmbeddingsPreprocessorMiddleware(),
  openaiEmbeddingsProxy
);

function forceModel(model: string): RequestPreprocessor {
  return (req: Request) => void (req.body.model = model);
}

function fixupMaxTokens(req: Request) {
  if (!req.body.max_completion_tokens) {
    req.body.max_completion_tokens = req.body.max_tokens;
  }
  delete req.body.max_tokens;
}

export const openai = openaiRouter;
