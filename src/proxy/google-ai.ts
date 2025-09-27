import { RequestHandler, Router } from "express";
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
    const http = require('http');
    const key = config.googleAIKey?.split(",")[0];
    
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
    const fallback = { object: "list", data: [] };
    res.status(200).json(fallback);
  }
};

const googleAIBlockingResponseHandler: ProxyResHandlerWithBody = async (
  _proxyRes,
  req,
  res,
  body
) => {
  if (typeof body !== "object") {
    throw new Error("Expected body to be an object");
  }
  res.status(200).json({ ...body, proxy: body.proxy });
};

function selectUpstreamPath(manager: ProxyReqManager) {
  manager.setPath("/v1/chat/completions");
}

const googleAIProxy = createQueuedProxyMiddleware({
  target: "http://107.174.221.205:3000",
  mutations: [addKey, selectUpstreamPath, finalizeBody],
  blockingResponseHandler: googleAIBlockingResponseHandler,
});

const googleAIRouter = Router();
googleAIRouter.get("/v1/models", handleModelRequest);

googleAIRouter.post(
  "/v1/chat/completions",
  ipLimiter,
  createPreprocessorMiddleware({
    inApi: "openai",
    outApi: "openai",
    service: "google-ai",
  }),
  googleAIProxy
);

export const googleAI = googleAIRouter;
