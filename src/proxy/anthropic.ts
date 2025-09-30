import { Request, RequestHandler, Router } from "express";
import { config } from "../config";
import { ipLimiter } from "./rate-limit";
import {
  addKey,
  createPreprocessorMiddleware,
  finalizeBody,
} from "./middleware/request";
import { ProxyResHandlerWithBody } from "./middleware/response";
import { createQueuedProxyMiddleware } from "./middleware/request/proxy-middleware-factory";
import { ProxyReqManager } from "./middleware/request/proxy-req-manager";

let modelsCache: any = null;
let modelsCacheTime = 0;

const handleModelRequest: RequestHandler = async (req, res) => {
  if (new Date().getTime() - modelsCacheTime < 1000 * 60) {
    return res.status(200).json(modelsCache);
  }

  try {
    // 从您的OpenAI兼容端点获取模型列表
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    const parsedUrl = url.parse('http://107.174.140.107:3000/v1/models');
    const client = parsedUrl.protocol === 'https:' ? https : http;
    const key = config.anthropicKey?.split(",")[0];
    
    const response = await new Promise((resolve, reject) => {
      const options = {
        ...parsedUrl,
        headers: {
          'Authorization': `Bearer ${key}`
        }
      };
      const req = client.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
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

const anthropicBlockingResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }

  // 直接返回OpenAI兼容端点的响应，无需转换
  res.status(200).json({ ...body, proxy: body.proxy });
};

function flattenChatResponse(
  content: { type: string; text: string }[]
): string {
  return content
    .map((part: { type: string; text: string }) =>
      part.type === "text" ? part.text : ""
    )
    .join("\n");
}

export function transformAnthropicChatResponseToAnthropicText(
  anthropicBody: Record<string, any>
): Record<string, any> {
  return {
    type: "completion",
    id: "ant-" + anthropicBody.id,
    completion: flattenChatResponse(anthropicBody.content),
    stop_reason: anthropicBody.stop_reason,
    stop: anthropicBody.stop_sequence,
    model: anthropicBody.model,
    usage: anthropicBody.usage,
  };
}

function transformAnthropicTextResponseToOpenAI(
  anthropicBody: Record<string, any>,
  req: Request
): Record<string, any> {
  const totalTokens = (req.promptTokens ?? 0) + (req.outputTokens ?? 0);
  return {
    id: "ant-" + anthropicBody.log_id,
    object: "chat.completion",
    created: Date.now(),
    model: anthropicBody.model,
    usage: {
      prompt_tokens: req.promptTokens,
      completion_tokens: req.outputTokens,
      total_tokens: totalTokens,
    },
    choices: [
      {
        message: {
          role: "assistant",
          content: anthropicBody.completion?.trim(),
        },
        finish_reason: anthropicBody.stop_reason,
        index: 0,
      },
    ],
  };
}

export function transformAnthropicChatResponseToOpenAI(
  anthropicBody: Record<string, any>
): Record<string, any> {
  return {
    id: "ant-" + anthropicBody.id,
    object: "chat.completion",
    created: Date.now(),
    model: anthropicBody.model,
    usage: anthropicBody.usage,
    choices: [
      {
        message: {
          role: "assistant",
          content: flattenChatResponse(anthropicBody.content),
        },
        finish_reason: anthropicBody.stop_reason,
        index: 0,
      },
    ],
  };
}

/**
 * If a client using the OpenAI compatibility endpoint requests an actual OpenAI
 * model, reassigns it to Sonnet.
 */
function maybeReassignModel(req: Request) {
  const model = req.body.model;
  if (model.includes("claude")) return; // use whatever model the user requested
  req.body.model = "claude-3-5-sonnet-latest";
}

/**
 * If client requests more than 4096 output tokens the request must have a
 * particular version header.
 * https://docs.anthropic.com/en/release-notes/api#july-15th-2024
 */
function setAnthropicBetaHeader(req: Request) {
  const { max_tokens_to_sample } = req.body;
  if (max_tokens_to_sample > 4096) {
    req.headers["anthropic-beta"] = "max-tokens-3-5-sonnet-2024-07-15";
  }
}

function selectUpstreamPath(manager: ProxyReqManager) {
  const req = manager.request;
  const pathname = req.url.split("?")[0];
  req.log.debug({ pathname }, "Anthropic path filter - routing to OpenAI compatible endpoint");
  
  // 统一转发到 OpenAI 兼容的 chat/completions 端点
  manager.setPath("/v1/chat/completions");
}

const anthropicProxy = createQueuedProxyMiddleware({
  target: "http://107.174.140.107:3000",
  mutations: [addKey, selectUpstreamPath, finalizeBody],
  blockingResponseHandler: anthropicBlockingResponseHandler,
});

const nativeAnthropicChatPreprocessor = createPreprocessorMiddleware(
  { inApi: "openai", outApi: "openai", service: "anthropic" },
  { afterTransform: [setAnthropicBetaHeader] }
);

const nativeTextPreprocessor = createPreprocessorMiddleware({
  inApi: "openai",
  outApi: "openai",
  service: "anthropic",
});

const textToChatPreprocessor = createPreprocessorMiddleware({
  inApi: "openai",
  outApi: "openai",
  service: "anthropic",
});

/**
 * Routes text completion prompts to anthropic-chat if they need translation
 * (claude-3 based models do not support the old text completion endpoint).
 */
const preprocessAnthropicTextRequest: RequestHandler = (req, res, next) => {
  if (req.body.model?.startsWith("claude-3")) {
    textToChatPreprocessor(req, res, next);
  } else {
    nativeTextPreprocessor(req, res, next);
  }
};

const oaiToTextPreprocessor = createPreprocessorMiddleware({
  inApi: "openai",
  outApi: "openai",
  service: "anthropic",
});

const oaiToChatPreprocessor = createPreprocessorMiddleware({
  inApi: "openai",
  outApi: "openai",
  service: "anthropic",
});

/**
 * Routes an OpenAI prompt to either the legacy Claude text completion endpoint
 * or the new Claude chat completion endpoint, based on the requested model.
 */
const preprocessOpenAICompatRequest: RequestHandler = (req, res, next) => {
  maybeReassignModel(req);
  if (req.body.model?.includes("claude-3")) {
    oaiToChatPreprocessor(req, res, next);
  } else {
    oaiToTextPreprocessor(req, res, next);
  }
};

const anthropicRouter = Router();
anthropicRouter.get("/v1/models", handleModelRequest);
// Native Anthropic chat completion endpoint.
anthropicRouter.post(
  "/v1/messages",
  ipLimiter,
  nativeAnthropicChatPreprocessor,
  anthropicProxy
);
// Anthropic text completion endpoint. Translates to Anthropic chat completion
// if the requested model is a Claude 3 model.
anthropicRouter.post(
  "/v1/complete",
  ipLimiter,
  preprocessAnthropicTextRequest,
  anthropicProxy
);
// OpenAI-to-Anthropic compatibility endpoint. Accepts an OpenAI chat completion
// request and transforms/routes it to the appropriate Anthropic format and
// endpoint based on the requested model.
anthropicRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  preprocessOpenAICompatRequest,
  anthropicProxy
);

export const anthropic = anthropicRouter;
