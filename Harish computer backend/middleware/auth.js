const jwt = require("jsonwebtoken");
const store = require("../config/store");
const { assert } = require("../utils/errors");
async function authenticate(req, _res, next) {
  try {
    const token = req.cookies?.hcs_session;
    assert(token, "Please sign in", 401);
    let claims;
    try {
      claims = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch {
      assert(false, "Session expired. Please sign in", 401);
    }
    req.user = await store
      .read((tx) => tx.get("User", claims.sub))
      .catch(() => null);
    assert(
      req.user?.active &&
        req.user.role === "admin" &&
        claims.version === req.user.tokenVersion,
      "Session expired. Please sign in",
      401,
    );
    next();
  } catch (e) {
    next(e);
  }
}
const permit = () => (req, _res, next) => {
  try {
    assert(
      req.user.role === "admin",
      "You do not have permission for this action",
      403,
    );
    next();
  } catch (e) {
    next(e);
  }
};
const publicUser = (u) => {
  const { password, tokenVersion, ...safe } = u;
  return safe;
};
module.exports = { authenticate, permit, publicUser };
