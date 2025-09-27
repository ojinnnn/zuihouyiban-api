import { Router } from "express";
import { UserPartialSchema } from "../../shared/users/schema";
import * as userStore from "../../shared/users/user-store";
import { ForbiddenError, BadRequestError } from "../../shared/errors";
import { sanitizeAndTrim } from "../../shared/utils";
import { config } from "../../config";
import { getTokenCostUsd, prettyTokens } from "../../shared/stats";
import { MODEL_FAMILIES, ModelFamily } from "../../shared/models";

const router = Router();

router.use((req, res, next) => {
  if (req.session.userToken) {
    res.locals.currentSelfServiceUser =
      userStore.getUser(req.session.userToken) || null;
  }
  next();
});

router.get("/", (_req, res) => {
  res.redirect("/");
});

router.get("/lookup", (_req, res) => {
  const ipLimit =
    (res.locals.currentSelfServiceUser?.maxIps ?? config.maxIpsPerUser) || 0;
  
  // Calculate next quota refresh time
  const now = new Date();
  const nextRefresh = new Date(now);
  nextRefresh.setUTCHours(0, 0, 0, 0);
  nextRefresh.setUTCDate(nextRefresh.getUTCDate() + 1);
  
  // 确保用户对象包含必要的token计数和限制属性
  let user = res.locals.currentSelfServiceUser;
  if (user) {
    // 确保tokenCounts和tokenLimits属性存在
    if (!user.tokenCounts) {
      user.tokenCounts = MODEL_FAMILIES.reduce(
        (acc: Record<ModelFamily, number>, family: ModelFamily) => ({ ...acc, [family]: 0 }),
        {} as Record<ModelFamily, number>
      );
    }
    if (!user.tokenLimits) {
      user.tokenLimits = { ...config.tokenQuota };
    }
    if (!user.tokenRefresh) {
      user.tokenRefresh = MODEL_FAMILIES.reduce(
        (acc: Record<ModelFamily, number>, family: ModelFamily) => ({ ...acc, [family]: 0 }),
        {} as Record<ModelFamily, number>
      );
    }
  }
  
  res.render("user_lookup", {
    user,
    ipLimit,
    quota: config.tokenQuota,
    nextQuotaRefresh: nextRefresh.toISOString(),
    showTokenCosts: config.showTokenCosts,
    prettyTokens,
    tokenCost: getTokenCostUsd,
  });
});

router.post("/lookup", (req, res) => {
  const token = req.body.token;
  const user = userStore.getUser(token);
  req.log.info(
    { token: truncateToken(token), success: !!user },
    "User self-service lookup"
  );
  if (!user) {
    req.session.flash = { type: "error", message: `Invalid user token: ${truncateToken(token)}` };
    return res.redirect("/user/lookup");
  }
  req.session.userToken = user.token;
  
  // 添加成功查询的flash消息，显示token有效期信息
  const expiryInfo = user.expiresAt 
    ? `Token expires at: ${new Date(user.expiresAt).toLocaleString()}`
    : 'Token has no expiry date';
  
  req.session.flash = { 
    type: "success", 
    message: `Token lookup successful! ${expiryInfo}`
  };
  
  return res.redirect("/user/lookup");
});

router.post("/edit-nickname", (req, res) => {
  const existing = res.locals.currentSelfServiceUser;

  if (!existing) {
    throw new ForbiddenError("Not logged in.");
  } else if (!config.allowNicknameChanges || existing.disabledAt) {
    throw new ForbiddenError("Nickname changes are not allowed.");
  } else if (!config.maxIpsAutoBan && !existing.ip.includes(req.ip)) {
    throw new ForbiddenError(
      "Nickname changes are only allowed from registered IPs."
    );
  }

  const schema = UserPartialSchema.pick({ nickname: true })
    .strict()
    .transform((v) => ({ nickname: sanitizeAndTrim(v.nickname) }));

  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new BadRequestError(result.error.message);
  }

  const newNickname = result.data.nickname || null;
  userStore.upsertUser({ token: existing.token, nickname: newNickname });
  req.session.flash = { type: "success", message: "Nickname updated." };
  return res.redirect("/user/lookup");
});

function truncateToken(token: string) {
  const sliceLength = Math.max(Math.floor(token.length / 8), 1);
  return `${token.slice(0, sliceLength)}...${token.slice(-sliceLength)}`;
}

export { router as selfServiceRouter };
