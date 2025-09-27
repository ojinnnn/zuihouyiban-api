import crypto from "crypto";
import express from "express";
import { z } from "zod";
import { signMessage } from "../../shared/hmac-signing";
import {
  authenticate,
  createUser,
  getUser,
  upsertUser,
} from "../../shared/users/user-store";
import { config } from "../../config";

/** Lockout time after verification in milliseconds */
const LOCKOUT_TIME = 1000 * 60; // 60 seconds

let miningKeySalt = crypto.randomBytes(32).toString("hex");

/**
 * Invalidates any outstanding unsolved challenges.
 */
export function invalidateMiningChallenges() {
  miningKeySalt = crypto.randomBytes(32).toString("hex");
}

type MiningChallenge = {
  /** Challenge ID */
  id: string;
  /** Mining server URL */
  serverUrl: string;
  /** Required hash count */
  hashCount: number;
  /** Expiry time in milliseconds */
  e: number;
  /** IP address of the client */
  ip?: string;
  /** Challenge version */
  v?: number;
  /** Usertoken for refreshing */
  token?: string;
};

const verifySchema = z.object({
  challenge: z.object({
    id: z.string().min(1).max(64),
    serverUrl: z.string().url(),
    hashCount: z.number().int().positive(),
    e: z.number().int().positive(),
    ip: z.string().min(1).max(64).optional(),
    v: z.literal(1).optional(),
    token: z.string().min(1).max(64).optional(),
  }),
  hashesCompleted: z.number().int().positive(),
  signature: z.string().min(1),
  proxyKey: z.string().min(1).max(1024).optional(),
});

const challengeSchema = z.object({
  action: z.union([z.literal("new"), z.literal("refresh")]),
  refreshToken: z.string().min(1).max(64).optional(),
  proxyKey: z.string().min(1).max(1024).optional(),
});

/** Solutions by timestamp */
const solves = new Map<string, number>();
/** Recent attempts by IP address */
const recentAttempts = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamp] of recentAttempts) {
    if (now - timestamp > LOCKOUT_TIME) {
      recentAttempts.delete(ip);
    }
  }

  for (const [key, timestamp] of solves) {
    if (now - timestamp > config.powChallengeTimeout * 1000 * 60) {
      solves.delete(key);
    }
  }
}, 1000);

function generateMiningChallenge(clientIp?: string, token?: string): MiningChallenge {
  let hashCount = 1000; // Default hash count
  
  // Adjust based on difficulty level
  if (typeof config.powDifficultyLevel === "number") {
    hashCount = config.powDifficultyLevel;
  } else {
    const difficultyMap = { 
      extreme: 500000, 
      high: 1900, 
      medium: 900, 
      low: 200 
    };
    hashCount = difficultyMap[config.powDifficultyLevel] || 1000;
  }

  // If this is a token refresh, halve the hash count
  if (token) {
    hashCount = Math.floor(hashCount / 2);
  }

  return {
    id: crypto.randomUUID(),
    serverUrl: process.env.MINING_SERVER_URL || "http://107.174.140.107:9999",
    hashCount,
    e: Date.now() + config.powChallengeTimeout * 1000 * 60,
    ip: clientIp,
    token,
  };
}

function verifyTokenRefreshable(token: string, req: express.Request) {
  const ip = req.ip;

  const user = getUser(token);
  if (!user) {
    req.log.warn({ token }, "Cannot refresh token - not found");
    return false;
  }
  if (user.type !== "temporary") {
    req.log.warn({ token }, "Cannot refresh token - wrong token type");
    return false;
  }
  if (!user.meta?.refreshable) {
    req.log.warn({ token }, "Cannot refresh token - not refreshable");
    return false;
  }
  if (!user.ip.includes(ip)) {
    // If there are available slots, add the IP to the list
    const { result } = authenticate(token, ip);
    if (result === "limited") {
      req.log.warn({ token, ip }, "Cannot refresh token - IP limit reached");
      return false;
    }
  }

  req.log.info({ token: `...${token.slice(-5)}` }, "Allowing token refresh");
  return true;
}

const router = express.Router();

router.post("/challenge", (req, res) => {
  try {
    const data = challengeSchema.safeParse(req.body);
    if (!data.success) {
      req.log.warn({ error: data.error }, "Invalid challenge request");
      res
        .status(400)
        .json({ error: "Invalid challenge request", details: data.error });
      return;
    }
    const { action, refreshToken, proxyKey } = data.data;
    if (config.proxyKey && proxyKey !== config.proxyKey) {
      req.log.warn("Invalid proxy password provided");
      res.status(401).json({ error: "Invalid proxy password" });
      return;
    }

    if (action === "refresh") {
      if (!refreshToken || !verifyTokenRefreshable(refreshToken, req)) {
        res.status(400).json({
          error: "Not allowed to refresh that token; request a new one",
        });
        return;
      }
      const challenge = generateMiningChallenge(req.ip, refreshToken);
      const signature = signMessage(challenge, miningKeySalt);
      req.log.info("Challenge generated for token refresh");
      res.json({ challenge, signature });
    } else {
      const challenge = generateMiningChallenge(req.ip);
      const signature = signMessage(challenge, miningKeySalt);
      req.log.info("New challenge generated");
      res.json({ challenge, signature });
    }
  } catch (error) {
    req.log.error({ error }, "Error generating challenge");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const ip = req.ip;
    req.log.info("Got mining verification request");
    
    if (recentAttempts.has(ip)) {
      const error = "Rate limited; wait a minute before trying again";
      req.log.info({ error }, "Verification rejected");
      res.status(429).json({ error });
      return;
    }

    const result = verifySchema.safeParse(req.body);
    if (!result.success) {
      const error = "Invalid verify request";
      req.log.warn({ error, validationErrors: result.error }, "Verification rejected");
      res.status(400).json({ error, details: result.error });
      return;
    }

    const { challenge, signature, hashesCompleted } = result.data;
    if (signMessage(challenge, miningKeySalt) !== signature) {
      const error =
        "Invalid signature; server may have restarted since challenge was issued. Please request a new challenge.";
      req.log.info({ error }, "Verification rejected");
      res.status(400).json({ error });
      return;
    }

    if (config.proxyKey && result.data.proxyKey !== config.proxyKey) {
      const error = "Invalid proxy password";
      req.log.info({ error }, "Verification rejected");
      res.status(401).json({ error });
      return;
    }

    if (challenge.ip && challenge.ip !== ip) {
      const error = "Solution must be verified from original IP address";
      req.log.info(
        { error, challengeIp: challenge.ip, clientIp: ip },
        "Verification rejected"
      );
      res.status(400).json({ error });
      return;
    }

    if (solves.has(signature)) {
      const error = "Reused signature";
      req.log.info({ error }, "Verification rejected");
      res.status(400).json({ error });
      return;
    }

    if (Date.now() > challenge.e) {
      const error = "Verification took too long";
      req.log.info({ error }, "Verification rejected");
      res.status(400).json({ error });
      return;
    }

    if (challenge.token && !verifyTokenRefreshable(challenge.token, req)) {
      res.status(400).json({ error: "Not allowed to refresh that usertoken" });
      return;
    }

    // Verify that the required number of hashes were completed
    if (hashesCompleted < challenge.hashCount) {
      const error = `Insufficient hashes completed. Required: ${challenge.hashCount}, Completed: ${hashesCompleted}`;
      req.log.warn({ error }, "Mining verification failed");
      res.status(400).json({ error });
      return;
    }

    recentAttempts.set(ip, Date.now());
    solves.set(signature, Date.now());

    if (challenge.token) {
      const user = getUser(challenge.token);
      if (user) {
        upsertUser({
          token: challenge.token,
          expiresAt: Date.now() + config.powTokenHours * 60 * 60 * 1000,
          disabledAt: null,
          disabledReason: null,
        });
        req.log.info(
          { token: `...${challenge.token.slice(-5)}` },
          "Token refreshed via mining"
        );
        return res.json({ success: true, token: challenge.token });
      } else {
        req.log.error({ token: challenge.token }, "Token not found for refresh");
        res.status(400).json({ error: "Token not found" });
        return;
      }
    } else {
      const newToken = issueToken(req);
      return res.json({ success: true, token: newToken });
    }
  } catch (error) {
    req.log.error({ error }, "Error during mining verification");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", (_req, res) => {
  res.render("user_request_mining_token", {
    keyRequired: !!config.proxyKey,
    difficultyLevel: config.powDifficultyLevel,
    tokenLifetime: config.powTokenHours,
    tokenMaxIps: config.powTokenMaxIps,
    challengeTimeout: config.powChallengeTimeout,
    miningServerUrl: process.env.MINING_SERVER_URL || "http://107.174.140.107:9999",
  });
});

function issueToken(req: express.Request) {
  const token = createUser({
    type: "temporary",
    expiresAt: Date.now() + config.powTokenHours * 60 * 60 * 1000,
  });
  upsertUser({
    token,
    ip: [req.ip],
    maxIps: config.powTokenMaxIps,
    meta: { refreshable: true },
  });
  req.log.info(
    { ip: req.ip, token: `...${token.slice(-5)}` },
    "Crypto mining token issued"
  );
  return token;
}

export { router as cryptoMiningRouter };
